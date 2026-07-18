function __key_groups
    command key __complete groups 2>/dev/null
end

function __key_names
    set -l fwd
    set -l tokens (commandline -opc)
    for i in (seq (count $tokens))
        if contains -- $tokens[$i] -g --group; and test $i -lt (count $tokens)
            set fwd --group $tokens[(math $i + 1)]
        end
    end
    command key __complete names $fwd 2>/dev/null
end

complete -c key -f

complete -c key -n __fish_use_subcommand -a init -d 'Create the vault'
complete -c key -n __fish_use_subcommand -a apply -d 'Fill values into ./.env'
complete -c key -n __fish_use_subcommand -a run -d 'Run a command with secrets as env vars'
complete -c key -n __fish_use_subcommand -a scan -d 'Import an existing ./.env into the vault'
complete -c key -n __fish_use_subcommand -a diff -d 'Show drift between ./.env and the vault'
complete -c key -n __fish_use_subcommand -a set -d 'Store a secret'
complete -c key -n __fish_use_subcommand -a get -d 'Print a secret value'
complete -c key -n __fish_use_subcommand -a list -d 'List groups and names'
complete -c key -n __fish_use_subcommand -a rm -d 'Remove a secret'
complete -c key -n __fish_use_subcommand -a alias -d 'Manage alternative names'
complete -c key -n __fish_use_subcommand -a share -d 'Share a group as an encrypted QR code'
complete -c key -n __fish_use_subcommand -a import -d 'Import a shared group'
complete -c key -n __fish_use_subcommand -a lock -d 'End the session'
complete -c key -n __fish_use_subcommand -a passwd -d 'Change the vault password'
complete -c key -n __fish_use_subcommand -a vault -d 'Show or change where the vault is stored'
complete -c key -n __fish_use_subcommand -a help -d 'Show help'

complete -c key -s g -l group -x -a '(__key_groups)' -d 'Vault group'
complete -c key -s e -l env -r -d 'Target .env file'
complete -c key -l from -r -d 'Template file'
complete -c key -s f -l force -d 'Overwrite variables that already have a value'
complete -c key -s c -l copy -d 'Copy to clipboard'
complete -c key -s h -l help -d 'Show help'

complete -c key -n '__fish_seen_subcommand_from get rm set alias' -a '(__key_names)'
complete -c key -n '__fish_seen_subcommand_from apply' -a 'all (__key_names)'
complete -c key -n '__fish_seen_subcommand_from alias' -a 'add rm move'
complete -c key -n '__fish_seen_subcommand_from share import' -a '(__key_groups)'
