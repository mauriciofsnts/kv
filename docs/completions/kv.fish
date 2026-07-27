function __kv_groups
    command kv __complete groups 2>/dev/null
end

function __kv_names
    set -l fwd
    set -l tokens (commandline -opc)
    for i in (seq (count $tokens))
        if contains -- $tokens[$i] -g --group; and test $i -lt (count $tokens)
            set fwd --group $tokens[(math $i + 1)]
        end
    end
    command kv __complete names $fwd 2>/dev/null
end

complete -c kv -f

complete -c kv -n __fish_use_subcommand -a init -d 'Create the vault'
complete -c kv -n __fish_use_subcommand -a apply -d 'Fill values into ./.env'
complete -c kv -n __fish_use_subcommand -a run -d 'Run a command with secrets as env vars'
complete -c kv -n __fish_use_subcommand -a scan -d 'Import an existing ./.env into the vault'
complete -c kv -n __fish_use_subcommand -a diff -d 'Show drift between ./.env and the vault'
complete -c kv -n __fish_use_subcommand -a set -d 'Store a secret'
complete -c kv -n __fish_use_subcommand -a get -d 'Print a secret value'
complete -c kv -n __fish_use_subcommand -a list -d 'List groups and names'
complete -c kv -n __fish_use_subcommand -a rm -d 'Remove a secret'
complete -c kv -n __fish_use_subcommand -a alias -d 'Manage alternative names'
complete -c kv -n __fish_use_subcommand -a share -d 'Share a group as an encrypted payload'
complete -c kv -n __fish_use_subcommand -a import -d 'Import a shared group'
complete -c kv -n __fish_use_subcommand -a lock -d 'End the session'
complete -c kv -n __fish_use_subcommand -a config -d 'Show or change persisted settings'
complete -c kv -n __fish_use_subcommand -a passwd -d 'Change the vault password'
complete -c kv -n __fish_use_subcommand -a vault -d 'Show or change where the vault is stored'
complete -c kv -n __fish_use_subcommand -a help -d 'Show help'

complete -c kv -s g -l group -x -a '(__kv_groups)' -d 'Vault group'
complete -c kv -s e -l env -r -d 'Target .env file'
complete -c kv -l from -r -d 'Template file'
complete -c kv -s f -l force -d 'Overwrite variables that already have a value'
complete -c kv -s s -l safe -d 'Skip variables that already have a value'
complete -c kv -s c -l copy -d 'Copy to clipboard'
complete -c kv -s h -l help -d 'Show help'

complete -c kv -n '__fish_seen_subcommand_from get rm set alias' -a '(__kv_names)'
complete -c kv -n '__fish_seen_subcommand_from apply' -a 'all (__kv_names)'
complete -c kv -n '__fish_seen_subcommand_from alias' -a 'add rm move'
complete -c kv -n '__fish_seen_subcommand_from share import' -a '(__kv_groups)'
