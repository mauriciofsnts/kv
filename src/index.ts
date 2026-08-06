#!/usr/bin/env bun
import { parseArgs } from 'node:util'
import { VaultExistsError, VaultNotFoundError, WrongPasswordError } from './domain/errors.ts'
import { vaultAccess } from './composition.ts'
import { cmdApply } from './presentation/cli/apply.ts'
import { cmdDiff } from './presentation/cli/diffcmd.ts'
import { cmdUse } from './presentation/cli/groupcmd.ts'
import { cmdInit } from './presentation/cli/init.ts'
import { cmdRun } from './presentation/cli/run.ts'
import { cmdScan } from './presentation/cli/scan.ts'
import { cmdAlias, cmdGet, cmdList, cmdPasswd, cmdRm, cmdSet } from './presentation/cli/secrets.ts'
import { cmdComplete } from './presentation/cli/completions.ts'
import { cmdConfig } from './presentation/cli/configcmd.ts'
import { cmdImport, cmdShare } from './presentation/cli/share.ts'
import { cmdVault } from './presentation/cli/vaultcmd.ts'
import { ui, uiErr, type Ui } from './presentation/cli/ui.ts'

function help(u: Ui): string {
  const row = (usage: string, desc: string) => `  ${u.cyan(usage.padEnd(24))}  ${desc}`
  const cont = (desc: string) => `  ${' '.repeat(24)}  ${u.dim(desc)}`
  const head = (title: string) => u.bold(title)
  return [
    `${u.bold(u.cyan('kv'))} — encrypted .env manager`,
    '',
    head('Usage:'),
    row('kv', 'Open the TUI'),
    row('kv init', 'Create the vault'),
    row('kv apply <VAR|all>', 'Fill values into ./.env'),
    row('kv apply all --from F', 'Generate ./.env from a template (e.g. .env.example)'),
    row('kv run -- CMD [args]', "Run a command with the group's secrets as env vars"),
    row('kv scan', 'Import an existing ./.env into the vault'),
    row('kv diff', 'Show drift between ./.env and the vault (names only)'),
    row('kv set NAME', 'Store a secret (value via hidden prompt)'),
    row('kv get NAME [--copy]', "Print a secret's value (or copy it, auto-clears)"),
    row('kv list', 'List groups and names (never values)'),
    row('kv use [GROUP]', 'Show, or pin, the active group for this directory'),
    cont('(writes a .kv marker; no GROUP shows the current one)'),
    row('kv rm NAME', 'Remove a secret'),
    row('kv alias NAME', "List a secret's aliases"),
    row('kv alias add NAME A...', 'Add aliases (alternative names, same value)'),
    row('kv alias rm NAME A...', 'Remove aliases'),
    row('kv alias move NAME DEST', 'Turn NAME (and its aliases) into aliases of DEST'),
    row('kv share [GROUP]', 'Share a group as an encrypted payload + one-time code'),
    row('kv import [PAYLOAD]', 'Import a shared group (asks for the one-time code)'),
    row('kv lock', 'End the session (ask for the password again)'),
    row('kv passwd', 'Change the vault password'),
    row('kv config', 'Show persisted settings'),
    row('kv config force on|off', 'Make `kv apply` overwrite existing values by'),
    cont('default (no need for -f every time)'),
    row('kv vault [location]', 'Show or change where the vault is stored:'),
    cont('a file path or a database URL'),
    cont('(sqlite://, postgres://, mysql://, mariadb://)'),
    '',
    head('Options:'),
    row('--group, -g <group>', 'Vault group (default: .kv file in the directory, else "default")'),
    cont('set the .kv file for a directory with `kv use GROUP`'),
    row('--env, -e <file>', 'Target file for apply/scan/diff (default: ./.env)'),
    row('--from <file>', 'Template file for `kv apply all --from`'),
    row('--force, -f', 'kv apply: overwrite variables that already have a'),
    cont('value (by default they are skipped; make this the'),
    cont('default with `kv config force on`)'),
    row('--safe, -s', 'kv apply: skip variables that already have a value'),
    cont('even when force apply is enabled'),
    row('--copy, -c', 'kv get: copy to clipboard instead of printing'),
    row('--help, -h', 'Show this help'),
    '',
    head('Environment variables:'),
    row('KV_VAULT_PATH', 'Vault location: file path or database URL'),
    cont('(default: ~/.config/kv/vault.enc; also settable'),
    cont('via `kv vault`)'),
    row('KV_FORCE_APPLY', '1/true or 0/false: overwrite existing values on'),
    cont('`kv apply` (overrides `kv config force`)'),
    row('KV_SESSION_TTL', 'Session TTL in seconds (default: 900)'),
    row('KV_MIN_PASSWORD_LENGTH', 'Minimum vault password length (default: 8)'),
    '',
  ].join('\n')
}

async function main(): Promise<void> {
  // Everything after `--` goes untouched to `kv run` (the child command's
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
      safe: { type: 'boolean', short: 's' },
      copy: { type: 'boolean', short: 'c' },
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: true,
  })

  const [command, arg] = positionals

  if (values.help) {
    console.log(help(ui))
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
        safe: values.safe,
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
    case 'use':
      await cmdUse(arg)
      break
    case 'rm':
      await cmdRm(arg, values.group)
      break
    case 'alias':
      await cmdAlias(positionals.slice(1), values.group)
      break
    case 'config':
      await cmdConfig(positionals.slice(1))
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
    case '__complete':
      await cmdComplete(arg, values.group)
      break
    case 'lock':
      vaultAccess.lock()
      console.log(ui.ok('Session ended.'))
      break
    case 'passwd':
      await cmdPasswd()
      break
    case 'help':
      console.log(help(ui))
      break
    default:
      console.error(uiErr.bad(`Unknown command: ${command}`) + '\n')
      console.error(help(uiErr))
      process.exit(1)
  }
}

main().catch((err) => {
  if (
    err instanceof WrongPasswordError ||
    err instanceof VaultNotFoundError ||
    err instanceof VaultExistsError
  ) {
    console.error(uiErr.bad(err.message))
  } else if (err instanceof Error && err.message === 'canceled') {
    console.error(uiErr.dim('Canceled.'))
  } else if (
    err instanceof TypeError &&
    typeof (err as NodeJS.ErrnoException).code === 'string' &&
    (err as NodeJS.ErrnoException).code!.startsWith('ERR_PARSE_ARGS')
  ) {
    console.error(uiErr.bad(err.message))
    console.error(uiErr.dim("Run 'kv help' to see available commands and options."))
  } else {
    console.error(err)
  }
  process.exit(1)
})
