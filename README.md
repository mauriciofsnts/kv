# kv

Encrypted .env manager with a TUI, in the spirit of [sops](https://github.com/getsops/sops): only whoever has the password can decrypt. The differentiator is `kv apply`, which fills real values straight into the project's `.env`.

```
POSTGRES_DB=placeholder      →  kv apply POSTGRES_DB  →  POSTGRES_DB=real_value
```

## Install

### Single binary (no Bun required)

`bun run build` compiles everything (runtime included) into one executable:

```bash
bun install
bun run build          # → dist/kv (this platform)
bun run build:release  # → dist/release/*.tar.gz (linux/darwin × x64/arm64, for GitHub Releases)
```

Copy `dist/kv` anywhere on your `PATH` — the machine running it doesn't need Bun.

### From source

Requires [Bun](https://bun.sh) ≥ 1.3.

```bash
bun install
bun link   # puts the `kv` command on your PATH
```

### Shell completions

Completion scripts live in [`docs/completions/`](docs/completions/) — subcommands, flags, and (when the vault session is unlocked) group and secret *names* are completed dynamically; values are never involved:

```bash
cp docs/completions/_kv "${fpath[1]}/_kv"                                       # zsh
cp docs/completions/kv.bash ~/.local/share/bash-completion/completions/kv      # bash
cp docs/completions/kv.fish ~/.config/fish/completions/kv.fish                 # fish
```

## Usage

```bash
kv init                        # create the vault (~/.config/kv/vault.enc)
kv                             # open the TUI
kv scan                        # import an existing ./.env into the vault
kv set POSTGRES_DB             # store a secret (value via hidden prompt)
kv apply POSTGRES_DB           # replace the value in ./.env
kv apply all                   # apply everything the vault knows about
kv apply all --from .env.example   # generate ./.env from a template
kv run -- npm start            # run with secrets as env vars (no .env at all)
kv diff                        # drift between ./.env and the vault (names only)
kv get POSTGRES_DB             # print the value (pipe-friendly)
kv get POSTGRES_DB --copy      # copy to clipboard, auto-clears in 30s
kv list                        # list groups and names (never values)
kv use                         # show the active group for this directory
kv use backend                 # pin it here (writes ./.kv), offers to create the group
kv rm POSTGRES_DB              # remove with confirmation
kv alias add DATABASE_URL DB_URL POSTGRES_URL   # alternative names, same value
kv alias rm DATABASE_URL POSTGRES_URL           # remove aliases
kv alias DATABASE_URL          # list a secret's aliases
kv alias move DB_URL DATABASE_URL               # DB_URL becomes an alias of DATABASE_URL
kv lock                        # end the session (ask for the password again)
kv passwd                      # change the password (re-encrypts the vault)
kv vault                       # show where the vault is stored
kv vault sqlite://~/.local/share/kv/vault.db      # move the vault to SQLite
kv vault postgres://user:pass@host:5432/db         # ...or to Postgres
kv share backend               # share a group: encrypted QR + one-time code
kv import                      # paste a shared payload and type the code
```

### Aliases

A secret can have alternative names that resolve to the same value — handy when different projects call the same thing `DB_URL`, `POSTGRES_URL` or `DATABASE_URL`:

```bash
kv set DATABASE_URL
kv alias add DATABASE_URL DB_URL POSTGRES_URL
kv apply all    # fills DATABASE_URL, DB_URL and POSTGRES_URL, all with the same value
kv get DB_URL   # also resolves through the alias
```

Aliases are unique within a group: an alias can't collide with another secret's name or aliases. In the TUI, the add/edit form has an **Aliases** field (comma-separated) and the list shows a `+N` badge next to names that have aliases.

Ended up with two secrets that should be one? `kv alias move SOURCE TARGET` folds them: `SOURCE` is deleted and its name — plus any aliases it had — become aliases of `TARGET`, so every old name keeps resolving, now to `TARGET`'s value. `SOURCE`'s own value is discarded (the command warns and asks for confirmation when the values differ). In the TUI, press `m` on a secret, pick the target with `↑↓` and confirm.

### Vault storage (file or database)

By default the vault is a local file (`~/.config/kv/vault.enc`), but it can live in a database instead — useful for backups or sharing one vault across machines:

```bash
kv vault                                        # show current location/backend
kv vault sqlite:///home/me/vaults/kv.db        # local SQLite database
kv vault postgres://user:pass@host:5432/mydb    # Postgres (also mysql:// / mariadb://)
```

- The location is a **file path** or a **database URL** (`sqlite://`, `postgres://`, `postgresql://`, `mysql://`, `mariadb://`), stored in `~/.config/kv/config.json`; `KV_VAULT_PATH` overrides it (same syntax).
- When switching, `kv vault` offers to **copy the existing vault** to the new location — no password needed, since only ciphertext moves.
- The database only ever stores the **encrypted envelope** (a single row in a `key_vault` table); encryption/decryption always happens locally, and the previous version is kept in a `previous` column (the file backend keeps a `.bak`).
- Database drivers are Bun built-ins (`Bun.SQL`) — no extra dependencies.

### Sharing a group (QR code)

`kv share GROUP` packages the group's secrets (values, notes, aliases), gzips and **encrypts them with a random one-time code**, then prints the payload as a terminal QR code plus the code:

```
$ kv share backend
Sharing group "backend" — 2 secrets: API_KEY, DATABASE_URL

  █▀▀▀▀▀█ ▀▄█▀ ... (scannable QR)

Payload (same content as the QR): kvshare1:fK5KFb9jQhUX...
One-time code:  9XDC-AAB5-9V4B-2SNG
```

On the other machine, `kv import` (paste the payload — scanned from the QR or copied as text — then type the code) decrypts it and merges the secrets into the receiver's own vault, reporting what was added/replaced and skipping names that collide with existing aliases. `--group` overrides the target group.

- The QR/payload alone is useless: it's AES-256-GCM ciphertext keyed from the one-time code (scrypt). Send the code through a **different channel** (say it out loud, different messenger).
- The code is forgiving: case, dashes and spaces don't matter.
- Big groups can exceed what a terminal QR can hold (~1200 chars); `kv share` then prints the payload text only.

### Groups

Secrets live in groups inside the vault (`default` if unspecified). Group resolution for `apply`/`set`/`get` follows this order:

1. `--group`/`-g` flag
2. A `.kv` file in the project directory containing the group name (a legacy `.key` file is also honored)
3. `default`

```bash
kv use my-project   # writes ./.kv; every `kv apply`/`set`/`get`/`run` here now targets my-project
                     # (group doesn't exist yet? kv use offers to create it)
kv use               # show which group is active here, and where it's pinned from
```

`kv use` is the fast path for switching between projects: `cd` into a directory, `kv use its-group` once, and every command run there afterwards is already scoped to it — no `--group` on each invocation. (You can still write the marker by hand — `echo "my-project" > .kv` — `kv use` just saves the round trip and validates the group.)

### Daily workflow

- **`kv scan`** — onboarding: reads the current `.env` and imports its variables into the vault, previewing what is new/updated/unchanged (names only, never values) before asking for confirmation.
- **`kv run -- <command>`** — runs a command with the group's secrets (canonical names *and* aliases) injected as environment variables. No plaintext ever touches the disk; the child's exit code is propagated.
- **`kv diff`** — drift report between `.env` and the vault: in sync / value differs / missing from vault / in vault but not in the file. Prints names only and exits 1 when values differ, so it can gate scripts and CI.
- **`kv get NAME --copy`** (or the `c` key in the TUI) — copies the value to the clipboard via `wl-copy`/`xclip`/`xsel` and auto-clears it after 30 seconds (only if the clipboard still holds that value).

### apply

- Edits the `.env` **in-place**, preserving comments, line order, `export` prefix and CRLF.
- **Safe by default**: a variable that already holds a (different, non-empty) value is left alone and reported as skipped; pass `--force`/`-f` to overwrite it.
- `kv config force on` makes overwriting the default so you never have to type `-f`; `--safe`/`-s` restores the skip behavior for a single run, and `kv config force off` restores it permanently. `KV_FORCE_APPLY=1|0` overrides the persisted setting.
- Values with spaces/`#`/quotes get double quotes automatically.
- `kv apply VAR` with a variable missing from the `.env` asks before appending it at the end.
- `kv apply all` prints a summary: `✓ 4 applied · ↷ 1 already set, use -f to overwrite (...) · − 2 missing from vault (...)`.
- `kv apply all --from .env.example` generates the target from a template instead of patching in place (the template is never modified; variables the vault doesn't know keep their template value). Without `--force`, non-empty values already in the target survive the regeneration.
- `--env file` targets another file (default `./.env`).

### TUI

`kv` with no arguments opens the panel. Keys:

| Key | Action |
|---|---|
| `↑↓` / `jk` | Move through secrets |
| `←→` | Switch group |
| `a` / `e` / `d` | Add / edit / delete (with confirmation) |
| `v` | Reveal/mask the selected value |
| `c` | Copy the selected value (auto-clears in 30s) |
| `/` | Search by name or alias |
| `g` | Create group |
| `q` | Quit |

## Security model

- **Vault**: a single file, `~/.config/kv/vault.enc`. The payload is JSON encrypted with **AES-256-GCM**; the key is derived from the password via **scrypt** (N=2¹⁵, r=8, p=1, random salt). A wrong password or a tampered file fails GCM authentication.
- **Session**: after unlocking, the **derived key** (never the password) lives in `$XDG_RUNTIME_DIR/kv/session` (tmpfs, gone on reboot, `0600`) for 15 minutes (configurable via `KV_SESSION_TTL`, in seconds), renewed on each use. `kv lock` deletes it immediately. Without `XDG_RUNTIME_DIR` it falls back to `~/.cache/kv/session` (disk) with a warning.
- **Atomic writes**: the vault is saved via `.tmp` + rename, keeping the previous version as `vault.enc.bak`.
- Values never travel through argv (`kv set` reads via hidden prompt) and `apply` only prints names, never values.

Environment variables:

| Variable | Meaning | Default |
|---|---|---|
| `KV_VAULT_PATH` | Vault location: file path or database URL (overrides `kv vault` config) | `~/.config/kv/vault.enc` |
| `KV_FORCE_APPLY` | `1`/`true` or `0`/`false`: overwrite existing values on `kv apply` (overrides `kv config force`) | unset |
| `KV_SESSION_TTL` | Session TTL in seconds | `900` |
| `KV_MIN_PASSWORD_LENGTH` | Minimum vault password length (enforced by `init` and `passwd`) | `8` |
| `KV_SESSION_PATH` | Session cache path (useful in tests) | `$XDG_RUNTIME_DIR/kv/session` |

## Development

```bash
bun test            # crypto, vault, session, .env parser
bun run typecheck   # tsc --noEmit
```

Stack: [TermUI](https://www.termui.io) (`@termuijs/*` 0.1.7) for the TUI; everything else uses only Node/Bun built-ins.

The codebase follows Clean Architecture — dependencies point inward only:

```
src/
├── domain/           # entities + pure rules (secrets/aliases, .env parser) — no I/O
├── application/      # use cases + ports (interfaces the use cases depend on)
├── infrastructure/   # port implementations: crypto, file/SQL storage, session, config
├── presentation/     # CLI and TUI, calling use cases only
└── composition.ts    # the single place wiring implementations to ports
```

### Notes on @termuijs 0.1.7

The framework is young and the published version has rough edges this codebase works around (look for comments in `src/tui/`):

- The layout engine doesn't measure content: **every** `box`/`text` needs explicit `width`/`height` (flexGrow/auto become 0 and the element vanishes).
- `useTerminalSize()` returns 0×0 — we use `src/tui/useTermSize.ts` instead.
- Colors outside the palette (e.g. `gray`) silently kill the whole render.
- The `TextInput`/`PasswordInput` widgets grab global focus and swallow Tab/Enter — forms use hand-rolled fields (`src/tui/inputs.tsx`).
- `useInput` handlers can retain closures from old renders — state is read via refs/`getState()` inside handlers.
