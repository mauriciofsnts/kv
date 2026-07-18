_kv_completions() {
  local cur prev words cword
  cur=${COMP_WORDS[COMP_CWORD]}
  prev=${COMP_WORDS[COMP_CWORD - 1]}
  words=("${COMP_WORDS[@]}")
  cword=$COMP_CWORD

  local commands="init apply run scan diff set get list rm alias config vault share import lock passwd help"

  case $prev in
    -g | --group)
      COMPREPLY=($(compgen -W "$(command kv __complete groups 2>/dev/null)" -- "$cur"))
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
    case ${words[i]} in
      -g | --group | -e | --env | --from) ((i++)) ;;
      -*) ;;
      *)
        cmd=${words[i]}
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
  for ((i = 1; i < ${#words[@]} - 1; i++)); do
    if [[ ${words[i]} == -g || ${words[i]} == --group ]]; then
      fwd=(--group "${words[i + 1]}")
    fi
  done

  case $cmd in
    apply)
      COMPREPLY=($(compgen -W "all $(command kv __complete names "${fwd[@]}" 2>/dev/null)" -- "$cur"))
      ;;
    get | rm | set | alias)
      COMPREPLY=($(compgen -W "$(command kv __complete names "${fwd[@]}" 2>/dev/null)" -- "$cur"))
      ;;
    share | import)
      COMPREPLY=($(compgen -W "$(command kv __complete groups 2>/dev/null)" -- "$cur"))
      ;;
  esac
}
complete -F _kv_completions kv
