# Shell completions

Static completion scripts for `key`. Subcommands and flags are completed from
these files; group and secret *names* are fetched at completion time via
`key __complete groups|names`, which only answers while the vault session is
unlocked and never prints values.

Install by copying the script for your shell:

```bash
# zsh — any directory in $fpath, then restart the shell
cp _key "${fpath[1]}/_key"

# bash
cp key.bash ~/.local/share/bash-completion/completions/key

# fish
cp key.fish ~/.config/fish/completions/key.fish
```

The scripts are static on purpose: they only change when the CLI grows or
loses a subcommand or flag, so keep them in sync with `src/index.ts` when
that happens.
