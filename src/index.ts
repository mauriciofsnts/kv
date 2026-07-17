#!/usr/bin/env bun
import { parseArgs } from 'node:util'
import { VaultExistsError, VaultNotFoundError, WrongPasswordError } from './domain/errors.ts'
import { vaultAccess } from './composition.ts'
import { cmdApply } from './presentation/cli/apply.ts'
import { cmdInit } from './presentation/cli/init.ts'
import { cmdAlias, cmdGet, cmdList, cmdPasswd, cmdRm, cmdSet } from './presentation/cli/secrets.ts'
import { cmdImport, cmdShare } from './presentation/cli/share.ts'
import { cmdVault } from './presentation/cli/vaultcmd.ts'

const HELP = `key — encrypted .env manager

Usage:
  key                       Open the TUI
  key init                  Create the vault
  key apply <VAR|all>       Fill values into ./.env
  key set NAME              Store a secret (value via hidden prompt)
  key get NAME              Print a secret's value
  key list                  List groups and names (never values)
  key rm NAME               Remove a secret
  key alias NAME            List a secret's aliases
  key alias add NAME A...   Add aliases (alternative names, same value)
  key alias rm NAME A...    Remove aliases
  key share [GROUP]         Share a group as an encrypted QR code + one-time code
  key import [PAYLOAD]      Import a shared group (asks for the one-time code)
  key lock                  End the session (ask for the password again)
  key passwd                Change the vault password
  key vault [location]      Show or change where the vault is stored:
                            a file path or a database URL
                            (sqlite://, postgres://, mysql://, mariadb://)

Options:
  --group, -g <group>       Vault group (default: .key file in the directory, else "default")
  --env, -e <file>          Target file for apply (default: ./.env)
  --help, -h                Show this help

Environment variables:
  KEY_VAULT_PATH            Vault location: file path or database URL
                            (default: ~/.config/key/vault.enc; also settable
                            via \`key vault\`)
  KEY_SESSION_TTL           Session TTL in seconds (default: 900)
  KEY_MIN_PASSWORD_LENGTH   Minimum vault password length (default: 8)
`

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      group: { type: 'string', short: 'g' },
      env: { type: 'string', short: 'e' },
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
      await cmdApply(arg, { group: values.group, envFile: values.env })
      break
    case 'set':
      await cmdSet(arg, values.group)
      break
    case 'get':
      await cmdGet(arg, values.group)
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
