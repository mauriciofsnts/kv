import { vaultAccess } from '../../composition.ts'
import { listGroups, listSecrets } from '../../domain/secret.ts'
import { resolveGroup } from './unlock.ts'

// `key __complete groups|names` — candidates for the shell completion scripts.
// Only ever uses the active session: completion must never prompt for a
// password or print errors, so on a locked/missing vault it stays silent.
export async function cmdComplete(what: string | undefined, groupFlag?: string): Promise<void> {
  try {
    const vault = await vaultAccess.openWithSession()
    if (!vault) return
    if (what === 'groups') {
      for (const group of listGroups(vault.data)) console.log(group)
    } else if (what === 'names') {
      const group = resolveGroup(groupFlag)
      for (const [name, secret] of listSecrets(vault.data, group)) {
        console.log(name)
        for (const alias of secret.aliases ?? []) console.log(alias)
      }
    }
  } catch {
    // Silent by design: a broken completion helper must not break the shell.
  }
}

export function cmdCompletions(shell: string | undefined): void {
  switch (shell) {
    case 'zsh':
      console.log(ZSH)
      break
    case 'bash':
      console.log(BASH)
      break
    case 'fish':
      console.log(FISH)
      break
    default:
      console.error('Usage: key completions <zsh|bash|fish>\n')
      console.error('  zsh:   key completions zsh > "\${fpath[1]}/_key"')
      console.error('  bash:  key completions bash > ~/.local/share/bash-completion/completions/key')
      console.error('  fish:  key completions fish > ~/.config/fish/completions/key.fish')
      process.exit(1)
  }
}

const ZSH = `#compdef key

_key_groups() {
  local -a groups
  groups=(\${(f)"$(command key __complete groups 2>/dev/null)"})
  (( $#groups )) && _describe -t groups 'group' groups
}

_key_names() {
  local -a names fwd
  local i
  for ((i = 1; i <= $#words; i++)); do
    if [[ $words[i] == -g || $words[i] == --group ]]; then
      fwd=(--group "$words[i+1]")
    fi
  done
  names=(\${(f)"$(command key __complete names $fwd 2>/dev/null)"})
  (( $#names )) && _describe -t secrets 'secret' names
}

_key_apply_targets() {
  local -a names
  _key_names
  names=(all)
  _describe -t targets 'target' names
}

_key() {
  local curcontext="$curcontext" state line
  typeset -A opt_args

  local -a group_opt env_opt
  group_opt=('(-g --group)'{-g,--group}'[vault group]:group:_key_groups')
  env_opt=('(-e --env)'{-e,--env}'[target .env file]:file:_files')

  _arguments -C \
    '(-h --help)'{-h,--help}'[show help]' \
    '1:command:->cmds' \
    '*::arg:->args' && return

  case $state in
    cmds)
      local -a commands
      commands=(
        'init:Create the vault'
        'apply:Fill values into ./.env'
        'run:Run a command with secrets as env vars'
        'scan:Import an existing ./.env into the vault'
        'diff:Show drift between ./.env and the vault'
        'set:Store a secret'
        'get:Print a secret value'
        'list:List groups and names'
        'rm:Remove a secret'
        'alias:Manage alternative names'
        'share:Share a group as an encrypted QR code'
        'import:Import a shared group'
        'lock:End the session'
        'passwd:Change the vault password'
        'vault:Show or change where the vault is stored'
        'completions:Print shell completions'
        'help:Show help'
      )
      _describe -t commands 'command' commands
      ;;
    args)
      case $words[1] in
        apply)
          _arguments $group_opt $env_opt \
            '--from[template file]:file:_files' \
            '(-f --force)'{-f,--force}'[overwrite variables that already have a value]' \
            '1:variable:_key_apply_targets'
          ;;
        get)
          _arguments $group_opt \
            '(-c --copy)'{-c,--copy}'[copy to clipboard]' \
            '1:secret:_key_names'
          ;;
        set|rm)
          _arguments $group_opt '1:secret:_key_names'
          ;;
        alias)
          _arguments $group_opt \
            '1:action:(add rm)' \
            '*:secret:_key_names'
          ;;
        scan|diff)
          _arguments $group_opt $env_opt
          ;;
        run|list)
          _arguments $group_opt
          ;;
        share|import)
          _arguments $group_opt '1:group:_key_groups'
          ;;
        completions)
          _values 'shell' zsh bash fish
          ;;
      esac
      ;;
  esac
}

_key "$@"`

const BASH = `_key_completions() {
  local cur prev words cword
  cur=\${COMP_WORDS[COMP_CWORD]}
  prev=\${COMP_WORDS[COMP_CWORD - 1]}
  words=("\${COMP_WORDS[@]}")
  cword=$COMP_CWORD

  local commands="init apply run scan diff set get list rm alias vault share import lock passwd completions help"

  case $prev in
    -g | --group)
      COMPREPLY=($(compgen -W "$(command key __complete groups 2>/dev/null)" -- "$cur"))
      return
      ;;
    -e | --env | --from)
      COMPREPLY=($(compgen -f -- "$cur"))
      return
      ;;
  esac

  # First non-flag word is the subcommand.
  local cmd="" i
  for ((i = 1; i < cword; i++)); do
    case \${words[i]} in
      -g | --group | -e | --env | --from) ((i++)) ;;
      -*) ;;
      *)
        cmd=\${words[i]}
        break
        ;;
    esac
  done

  if [[ -z $cmd ]]; then
    COMPREPLY=($(compgen -W "$commands" -- "$cur"))
    return
  fi

  # Forward --group so names come from the right group.
  local -a fwd=()
  for ((i = 1; i < \${#words[@]} - 1; i++)); do
    if [[ \${words[i]} == -g || \${words[i]} == --group ]]; then
      fwd=(--group "\${words[i + 1]}")
    fi
  done

  case $cmd in
    apply)
      COMPREPLY=($(compgen -W "all $(command key __complete names "\${fwd[@]}" 2>/dev/null)" -- "$cur"))
      ;;
    get | rm | set | alias)
      COMPREPLY=($(compgen -W "$(command key __complete names "\${fwd[@]}" 2>/dev/null)" -- "$cur"))
      ;;
    share | import)
      COMPREPLY=($(compgen -W "$(command key __complete groups 2>/dev/null)" -- "$cur"))
      ;;
    completions)
      COMPREPLY=($(compgen -W "zsh bash fish" -- "$cur"))
      ;;
  esac
}
complete -F _key_completions key`

const FISH = `function __key_groups
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
complete -c key -n __fish_use_subcommand -a completions -d 'Print shell completions'
complete -c key -n __fish_use_subcommand -a help -d 'Show help'

complete -c key -s g -l group -x -a '(__key_groups)' -d 'Vault group'
complete -c key -s e -l env -r -d 'Target .env file'
complete -c key -l from -r -d 'Template file'
complete -c key -s f -l force -d 'Overwrite variables that already have a value'
complete -c key -s c -l copy -d 'Copy to clipboard'
complete -c key -s h -l help -d 'Show help'

complete -c key -n '__fish_seen_subcommand_from get rm set alias' -a '(__key_names)'
complete -c key -n '__fish_seen_subcommand_from apply' -a 'all (__key_names)'
complete -c key -n '__fish_seen_subcommand_from alias' -a 'add rm'
complete -c key -n '__fish_seen_subcommand_from share import' -a '(__key_groups)'
complete -c key -n '__fish_seen_subcommand_from completions' -a 'zsh bash fish'`
