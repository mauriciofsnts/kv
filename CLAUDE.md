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

There is no lint setup. `bun.lock` is the source of truth (`pnpm-lock.yaml` is a leftover).

## Architecture

Three layers with a strict dependency rule: `src/core/` must never import from `src/tui/` or `src/cli/`, and uses only Node/Bun built-ins (no `@termuijs/*`). This isolation is deliberate — the TUI framework is v0.1.x and may be swapped out.

- **`src/core/`** — crypto (scrypt + AES-256-GCM envelope; wrong password = GCM auth failure → `WrongPasswordError`), vault model (groups → secrets, each secret optionally carrying `aliases`), storage backends, session cache, `.env` parser.
- **`src/cli/`** — subcommand implementations dispatched from `src/index.ts` (`util.parseArgs`). Prompts are hand-rolled in `cli/prompt.ts` (raw-mode hidden input); secret values never pass through argv.
- **`src/tui/`** — TermUI (`@termuijs/*`) app, entered via dynamic import only when `key` runs with no subcommand.

Cross-cutting flows worth knowing before editing:

- **Storage abstraction** (`core/storage.ts`): the vault "location" is a plain file path (atomic write via `.tmp` + rename, previous version in `.bak`) or a database URL — `sqlite://`, `postgres://`, `postgresql://`, `mysql://`, `mariadb://` — handled by one `SqlStorage` class over `Bun.SQL` (single-row `key_vault` table, previous version in a `previous` column; SQL kept dialect-portable: SELECT then UPDATE/INSERT, no upsert). Location resolution: `KEY_VAULT_PATH` env > `~/.config/key/config.json` (`key vault` command writes it) > default file. Vault functions in `core/vault.ts` are async because of this; they accept a storage instance, a location string, or nothing.
- **Session** (`core/session.ts`): after unlock, the *derived key* (never the password) is cached in `$XDG_RUNTIME_DIR/key/session` with a TTL renewed on each use. Both CLI (`cli/unlock.ts`) and TUI (`tui/run.ts`) try the session before prompting. Changing the password rekeys the vault and clears the session.
- **Alias resolution** (`core/vault.ts`): `resolveSecret` matches canonical names *and* aliases; `get`/`apply` go through it, while `set`/`rm`/`alias` operate on canonical names and use `ownerOfName` to reject collisions (an alias may not shadow any name/alias in its group).
- **`.env` patching** (`core/envfile.ts`): line-preserving by design — comments, order, `export` prefix, CRLF, missing trailing newline all survive. Duplicated variables are all updated on purpose. Don't replace this with a generic dotenv library; round-trip fidelity is the point.

## Tests

Tests isolate all global state through env vars read lazily by `core/paths.ts`: `KEY_VAULT_PATH`, `KEY_SESSION_PATH`, `KEY_SESSION_TTL`, `KEY_MIN_PASSWORD_LENGTH`, `XDG_CONFIG_HOME` — set them in `beforeEach`, delete in `afterEach` (existing suites show the pattern). Postgres/MySQL have no automated integration tests; verify manually against a container (`podman run --rm -e POSTGRES_PASSWORD=test -p 15432:5432 postgres:16-alpine`).

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
- `useTerminalSize()` returns 0×0 — use `tui/useTermSize.ts` instead.
- Don't use the framework's `TextInput`/`PasswordInput` widgets: they are focusable, and the App's FocusManager then routes all keys to them (swallowing Tab/Enter). Forms use the hand-rolled `Field` + `editValue` in `tui/inputs.tsx`, with the parent owning focus.
- `useInput`/`useKeymap` handlers can retain closures from old renders: read state via `useTuiStore.getState()` or refs inside handlers, never from captured variables; use functional `setState` updates.
- Every `.tsx` file needs the `/** @jsxImportSource @termuijs/jsx */` pragma — Bun only reads `tsconfig.json` from the cwd, and `key` runs from arbitrary directories.
- Keymaps are mode-scoped by mounting: `BrowseKeymap` etc. only exist while their mode is active, so single-letter bindings don't capture form typing. Keep that pattern when adding modes.

## Conventions

- All user-facing text, comments, and commit messages are in English; confirmations are `[y/N]`.
- `apply`/`list` print secret *names* only, never values (`get` is the deliberate exception).
- Password minimum length comes from `minPasswordLength()` (`KEY_MIN_PASSWORD_LENGTH`, default 8) — don't hardcode it.
