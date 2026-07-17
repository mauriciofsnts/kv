# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`key` is an encrypted .env manager (sops-style: password-derived key, whole-vault encryption) with a CLI and a TUI. Its signature feature is `key apply <VAR|all>`, which rewrites values in a project's `.env` in-place. Runtime is **Bun ≥ 1.3** (not Node — the TUI and DB drivers rely on Bun built-ins).

## Commands

```bash
bun test                       # full suite (bun:test)
bun test tests/vault.test.ts   # single file
bun test -t "aliases"          # filter by test name
bunx tsc --noEmit              # typecheck (also: bun run typecheck)
bun run src/index.ts …         # run the CLI without linking
bun link                       # put `key` on PATH (~/.bun/bin/key)
```

## Architecture (Clean Architecture)

Dependencies point strictly inward: `domain` ← `application` ← (`infrastructure`, `presentation`), with `src/composition.ts` as the only place that binds implementations to ports. `bunx tsc --noEmit` won't catch layer violations — respect them by convention:

- **`src/domain/`** — entities and pure business rules; zero imports from other layers, zero I/O. `secret.ts` (groups/secrets/aliases operations on plain `VaultData`), `env-file.ts` (the line-preserving .env parser), `errors.ts`.
- **`src/application/`** — `ports.ts` (interfaces: `CryptoProvider`, `VaultRepository`, `SessionCache`, `ConfigStore`, `EnvFileGateway`, plus the `EncryptedEnvelope`/`KdfParams` contracts) and `use-cases/` (factories taking ports: `vault-access` for init/unlock/save/rekey/session, `manage-secrets` for validated mutations shared by CLI and TUI, `apply-env`, `relocate-vault`). `vault.ts` defines the unlocked-`Vault` handle (data + key + kdf + repository).
- **`src/infrastructure/`** — port implementations: `crypto/node-crypto.ts` (scrypt + AES-256-GCM; bad password → `WrongPasswordError` from GCM auth), `storage/` (file repository with `.tmp`+rename+`.bak`; SQL repository over `Bun.SQL` — single-row `key_vault` table, previous version in a `previous` column, dialect-portable SELECT then UPDATE/INSERT; `repository-factory.ts` picks by URL scheme), `session/file-session-cache.ts`, `config/json-config-store.ts`, `env/fs-env-files.ts`.
- **`src/presentation/`** — `cli/` (subcommands dispatched from `src/index.ts` via `util.parseArgs`; raw-mode hidden prompts in `cli/prompt.ts` — secret values never pass through argv) and `tui/` (TermUI app, dynamically imported only when `key` runs bare). Presentation imports use cases from `src/composition.ts` and domain read functions directly; it must never import `src/infrastructure/`.

Cross-cutting flows worth knowing before editing:

- **Vault location**: a plain file path or a database URL (`sqlite://`, `postgres://`, `postgresql://`, `mysql://`, `mariadb://`). Resolution (in `json-config-store.ts`): `KEY_VAULT_PATH` env > `~/.config/key/config.json` (written by `key vault`) > default file. Only ciphertext ever reaches a repository.
- **Session**: after unlock, the *derived key* (never the password) is cached in `$XDG_RUNTIME_DIR/key/session` with a TTL renewed on each use. CLI (`presentation/cli/unlock.ts`) and TUI (`presentation/tui/run.ts`) both call `vaultAccess.openWithSession()` before prompting. `changePassword` rekeys and clears the session.
- **Alias resolution** (`domain/secret.ts`): `resolveSecret` matches canonical names *and* aliases; `get`/`apply` go through it, while mutations validate via `ownerOfName` (an alias may not shadow any name/alias in its group). Mutation validation lives in the `manage-secrets` use case — don't duplicate it in presentation.
- **`.env` patching** (`domain/env-file.ts`): line-preserving by design — comments, order, `export` prefix, CRLF, missing trailing newline all survive. Duplicated variables are all updated on purpose. Don't replace this with a generic dotenv library; round-trip fidelity is the point.
- **Group sharing** (`application/use-cases/share-group.ts`): `key share`/`key import`. Payload format v1 is a wire contract — `"keyshare1:" + base64url(salt|iv|tag|ciphertext)`, gzip inside, scrypt params fixed by the format (don't couple them to infra defaults). The gzip bytes cross the string-based CryptoProvider API via latin1 (byte-faithful). The one-time code is normalized (case/dashes/spaces) before key derivation.

## Tests

Use-case tests inject fakes for `SessionCache`/`ConfigStore` and real crypto + file/sqlite repositories (see the `makeTestbed` helper in `tests/vault.test.ts`). Infrastructure reads env vars lazily — `KEY_VAULT_PATH`, `KEY_SESSION_PATH`, `KEY_SESSION_TTL`, `KEY_MIN_PASSWORD_LENGTH`, `XDG_CONFIG_HOME` — set them in `beforeEach`, delete in `afterEach` (existing suites show the pattern). Postgres/MySQL have no automated integration tests; verify manually against a container (`podman run --rm -e POSTGRES_PASSWORD=test -p 15432:5432 postgres:16-alpine`).

The TUI has no automated tests. Verify it in a tmux harness:

```bash
tmux new-session -d -s key -x 100 -y 28 "KEY_VAULT_PATH=… KEY_SESSION_PATH=… bun run src/index.ts 2>/tmp/tui.err"
tmux send-keys -t key 'password' && tmux send-keys -t key Enter
tmux capture-pane -t key -p     # inspect the rendered screen
```

Send keys with small `sleep`s between actions — bursts can race a re-render.

## @termuijs 0.1.7 landmines (TUI only)

The published TermUI packages have bugs this code works around. Violating these fails **silently** (blank screen, dead keys):

- The layout engine does not measure content: every `box`/`text` needs explicit `width` and `height`; `flexGrow`/auto collapse to 0 and the subtree vanishes.
- Colors outside the named palette (e.g. `gray`) abort the entire render pass. Stick to basics (`cyan`, `white`, `red`, `yellow`, `green`).
- `useTerminalSize()` returns 0×0 — use `presentation/tui/useTermSize.ts` instead.
- Don't use the framework's `TextInput`/`PasswordInput` widgets: they are focusable, and the App's FocusManager then routes all keys to them (swallowing Tab/Enter). Forms use the hand-rolled `Field` + `editValue` in `presentation/tui/inputs.tsx`, with the parent owning focus.
- `useInput`/`useKeymap` handlers can retain closures from old renders: read state via `useTuiStore.getState()` or refs inside handlers, never from captured variables; use functional `setState` updates.
- Every `.tsx` file needs the `/** @jsxImportSource @termuijs/jsx */` pragma — Bun only reads `tsconfig.json` from the cwd, and `key` runs from arbitrary directories.
- Keymaps are mode-scoped by mounting: `BrowseKeymap` etc. only exist while their mode is active, so single-letter bindings don't capture form typing. Keep that pattern when adding modes.

## Conventions

- All user-facing text, comments, and commit messages are in English; confirmations are `[y/N]`.
- `apply`/`list` print secret *names* only, never values (`get` is the deliberate exception).
- Password minimum length comes from `minPasswordLength()` (`KEY_MIN_PASSWORD_LENGTH`, default 8) — don't hardcode it.
