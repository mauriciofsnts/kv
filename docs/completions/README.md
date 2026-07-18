# Shell completions

Static completion scripts for `kv`. Subcommands and flags are completed from
these files; group and secret *names* are fetched at completion time via
`kv __complete groups|names`, which only answers while the vault session is
unlocked and never prints values.

Install by copying the script for your shell:

```bash
# zsh — any directory in $fpath, then restart the shell
cp _kv "${fpath[1]}/_kv"

# bash
cp kv.bash ~/.local/share/bash-completion/completions/kv

# fish
cp kv.fish ~/.config/fish/completions/kv.fish
```

The scripts are static on purpose: they only change when the CLI grows or
loses a subcommand or flag, so keep them in sync with `src/index.ts` when
that happens.
