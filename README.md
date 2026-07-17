# key

Encrypted .env manager with a TUI, in the spirit of [sops](https://github.com/getsops/sops): only whoever has the password can decrypt. The differentiator is `key apply`, which fills real values straight into the project's `.env`.

```
POSTGRES_DB=placeholder      →  key apply POSTGRES_DB  →  POSTGRES_DB=real_value
```

## Install

Requires [Bun](https://bun.sh) ≥ 1.3.

```bash
bun install
bun link   # puts the `key` command on your PATH
```

## Usage

```bash
key init                        # create the vault (~/.config/key/vault.enc)
key                             # open the TUI
key set POSTGRES_DB             # store a secret (value via hidden prompt)
key apply POSTGRES_DB           # replace the value in ./.env
key apply all                   # apply everything the vault knows about
key get POSTGRES_DB             # print the value (pipe-friendly)
key list                        # list groups and names (never values)
key rm POSTGRES_DB              # remove with confirmation
key alias add DATABASE_URL DB_URL POSTGRES_URL   # alternative names, same value
key alias rm DATABASE_URL POSTGRES_URL           # remove aliases
key alias DATABASE_URL          # list a secret's aliases
key lock                        # end the session (ask for the password again)
key passwd                      # change the password (re-encrypts the vault)
```

### Aliases

A secret can have alternative names that resolve to the same value — handy when different projects call the same thing `DB_URL`, `POSTGRES_URL` or `DATABASE_URL`:

```bash
key set DATABASE_URL
key alias add DATABASE_URL DB_URL POSTGRES_URL
key apply all    # fills DATABASE_URL, DB_URL and POSTGRES_URL, all with the same value
key get DB_URL   # also resolves through the alias
```

Aliases are unique within a group: an alias can't collide with another secret's name or aliases. In the TUI, the add/edit form has an **Aliases** field (comma-separated) and the list shows a `+N` badge next to names that have aliases.

### Groups

Secrets live in groups inside the vault (`default` if unspecified). Group resolution for `apply`/`set`/`get` follows this order:

1. `--group`/`-g` flag
2. A `.key` file in the project directory containing the group name
3. `default`

```bash
echo "my-project" > .key   # every `key apply` in this directory uses the my-project group
```

### apply

- Edits the `.env` **in-place**, preserving comments, line order, `export` prefix and CRLF.
- Values with spaces/`#`/quotes get double quotes automatically.
- `key apply VAR` with a variable missing from the `.env` asks before appending it at the end.
- `key apply all` prints a summary: `✓ 4 applied · − 2 missing from vault (...)`.
- `--env file` targets another file (default `./.env`).

### TUI

`key` with no arguments opens the panel. Keys:

| Key | Action |
|---|---|
| `↑↓` / `jk` | Move through secrets |
| `←→` | Switch group |
| `a` / `e` / `d` | Add / edit / delete (with confirmation) |
| `v` | Reveal/mask the selected value |
| `/` | Search by name or alias |
| `g` | Create group |
| `q` | Quit |

## Security model

- **Vault**: a single file, `~/.config/key/vault.enc`. The payload is JSON encrypted with **AES-256-GCM**; the key is derived from the password via **scrypt** (N=2¹⁵, r=8, p=1, random salt). A wrong password or a tampered file fails GCM authentication.
- **Session**: after unlocking, the **derived key** (never the password) lives in `$XDG_RUNTIME_DIR/key/session` (tmpfs, gone on reboot, `0600`) for 15 minutes (configurable via `KEY_SESSION_TTL`, in seconds), renewed on each use. `key lock` deletes it immediately. Without `XDG_RUNTIME_DIR` it falls back to `~/.cache/key/session` (disk) with a warning.
- **Atomic writes**: the vault is saved via `.tmp` + rename, keeping the previous version as `vault.enc.bak`.
- Values never travel through argv (`key set` reads via hidden prompt) and `apply` only prints names, never values.

Environment variables:

| Variable | Meaning | Default |
|---|---|---|
| `KEY_VAULT_PATH` | Vault path | `~/.config/key/vault.enc` |
| `KEY_SESSION_TTL` | Session TTL in seconds | `900` |
| `KEY_MIN_PASSWORD_LENGTH` | Minimum vault password length (enforced by `init` and `passwd`) | `8` |
| `KEY_SESSION_PATH` | Session cache path (useful in tests) | `$XDG_RUNTIME_DIR/key/session` |

## Development

```bash
bun test            # crypto, vault, session, .env parser
bun run typecheck   # tsc --noEmit
```

Stack: [TermUI](https://www.termui.io) (`@termuijs/*` 0.1.7) for the TUI; the core (crypto/vault/apply) uses only Node/Bun built-ins.

### Notes on @termuijs 0.1.7

The framework is young and the published version has rough edges this codebase works around (look for comments in `src/tui/`):

- The layout engine doesn't measure content: **every** `box`/`text` needs explicit `width`/`height` (flexGrow/auto become 0 and the element vanishes).
- `useTerminalSize()` returns 0×0 — we use `src/tui/useTermSize.ts` instead.
- Colors outside the palette (e.g. `gray`) silently kill the whole render.
- The `TextInput`/`PasswordInput` widgets grab global focus and swallow Tab/Enter — forms use hand-rolled fields (`src/tui/inputs.tsx`).
- `useInput` handlers can retain closures from old renders — state is read via refs/`getState()` inside handlers.
