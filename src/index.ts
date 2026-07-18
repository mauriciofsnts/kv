#!/usr/bin/env bun
import { parseArgs } from 'node:util'
import { VaultExistsError, VaultNotFoundError, WrongPasswordError } from './domain/errors.ts'
import { vaultAccess } from './composition.ts'
import { cmdApply } from './presentation/cli/apply.ts'
import { cmdDiff } from './presentation/cli/diffcmd.ts'
import { cmdInit } from './presentation/cli/init.ts'
import { cmdRun } from './presentation/cli/run.ts'
import { cmdScan } from './presentation/cli/scan.ts'
import { cmdAlias, cmdGet, cmdList, cmdPasswd, cmdRm, cmdSet } from './presentation/cli/secrets.ts'
import { cmdComplete, cmdCompletions } from './presentation/cli/completions.ts'
import { cmdImport, cmdShare } from './presentation/cli/share.ts'
import { cmdVault } from './presentation/cli/vaultcmd.ts'

const HELP = `key — encrypted .env manager

Usage:
  key                       Open the TUI
  key init                  Create the vault
  key apply <VAR|all>       Fill values into ./.env
  key apply all --from F    Generate ./.env from a template (e.g. .env.example)
  key run -- CMD [args]     Run a command with the group's secrets as env vars
  key scan                  Import an existing ./.env into the vault
  key diff                  Show drift between ./.env and the vault (names only)
  key set NAME              Store a secret (value via hidden prompt)
  key get NAME [--copy]     Print a secret's value (or copy it, auto-clears)
  key list                  List groups and names (never values)
  key rm NAME               Remove a secret
  key alias NAME            List a secret's aliases
  key alias add NAME A...   Add aliases (alternative names, same value)
  key alias rm NAME A...    Remove aliases
  key share [GROUP]         Share a group as an encrypted QR code + one-time code
  key import [PAYLOAD]      Import a shared group (asks for the one-time code)
  key completions SHELL     Print shell completions (zsh, bash or fish)
  key lock                  End the session (ask for the password again)
  key passwd                Change the vault password
  key vault [location]      Show or change where the vault is stored:
                            a file path or a database URL
                            (sqlite://, postgres://, mysql://, mariadb://)

Options:
  --group, -g <group>       Vault group (default: .key file in the directory, else "default")
  --env, -e <file>          Target file for apply/scan/diff (default: ./.env)
  --from <file>             Template file for \`key apply all --from\`
  --force, -f               key apply: overwrite variables that already have a
                            value (by default they are skipped)
  --copy, -c                key get: copy to clipboard instead of printing
  --help, -h                Show this help

Environment variables:
  KEY_VAULT_PATH            Vault location: file path or database URL
                            (default: ~/.config/key/vault.enc; also settable
                            via \`key vault\`)
  KEY_SESSION_TTL           Session TTL in seconds (default: 900)
  KEY_MIN_PASSWORD_LENGTH   Minimum vault password length (default: 8)
`

async function main(): Promise<void> {
  // Everything after `--` goes untouched to `key run` (the child command's
  // own flags must not be parsed as ours).
  const rawArgs = process.argv.slice(2)
  const dashDash = rawArgs.indexOf('--')
  const ownArgs = dashDash === -1 ? rawArgs : rawArgs.slice(0, dashDash)
  const passthrough = dashDash === -1 ? [] : rawArgs.slice(dashDash + 1)

  const { values, positionals } = parseArgs({
    args: ownArgs,
    options: {
      group: { type: 'string', short: 'g' },
      env: { type: 'string', short: 'e' },
      from: { type: 'string' },
      force: { type: 'boolean', short: 'f' },
      copy: { type: 'boolean', short: 'c' },
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: true,
  })

  const [command, arg] = positionals

  if (values.help) {
    console.log(HELP)
    return
  }

  switch (command) {
    case undefined: {
      const { runTui } = await import('./presentation/tui/run.ts')
      await runTui()
      break
    }
    case 'init':
      await cmdInit()
      break
    case 'apply':
      await cmdApply(arg, {
        group: values.group,
        envFile: values.env,
        from: values.from,
        force: values.force,
      })
      break
    case 'run':
      await cmdRun(passthrough.length > 0 ? passthrough : positionals.slice(1), values.group)
      break
    case 'scan':
      await cmdScan(values.group, values.env)
      break
    case 'diff':
      await cmdDiff(values.group, values.env)
      break
    case 'set':
      await cmdSet(arg, values.group)
      break
    case 'get':
      await cmdGet(arg, values.group, values.copy)
      break
    case 'list':
      await cmdList(values.group)
      break
    case 'rm':
      await cmdRm(arg, values.group)
      break
    case 'alias':
      await cmdAlias(positionals.slice(1), values.group)
      break
    case 'vault':
      await cmdVault(arg)
      break
    case 'share':
      await cmdShare(arg, values.group)
      break
    case 'import':
      await cmdImport(arg, values.group)
      break
    case 'completions':
      cmdCompletions(arg)
      break
    case '__complete':
      await cmdComplete(arg, values.group)
      break
    case 'lock':
      vaultAccess.lock()
      console.log('Session ended.')
      break
    case 'passwd':
      await cmdPasswd()
      break
    case 'help':
      console.log(HELP)
      break
    default:
      console.error(`Unknown command: ${command}\n`)
      console.error(HELP)
      process.exit(1)
  }
}

main().catch((err) => {
  if (
    err instanceof WrongPasswordError ||
    err instanceof VaultNotFoundError ||
    err instanceof VaultExistsError
  ) {
    console.error(err.message)
  } else if (err instanceof Error && err.message === 'canceled') {
    console.error('Canceled.')
  } else {
    console.error(err)
  }
  process.exit(1)
})
