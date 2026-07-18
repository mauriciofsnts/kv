import { config, manageSecrets, vaultAccess } from '../../composition.ts'
import {
  getSecret,
  listGroups,
  listSecrets,
  ownerOfName,
  resolveSecret,
} from '../../domain/secret.ts'
import { confirmPrompt, hiddenPrompt } from './prompt.ts'
import { ui, uiErr } from './ui.ts'
import { resolveGroup, unlockVault } from './unlock.ts'

export async function cmdSet(name: string | undefined, groupFlag?: string): Promise<void> {
  if (!name) {
    console.error('Usage: key set NAME [--group group]')
    process.exit(1)
  }
  const vault = await unlockVault()
  const group = resolveGroup(groupFlag)
  const owner = ownerOfName(vault.data, group, name)
  if (owner && owner !== name) {
    console.error(uiErr.bad(`"${name}" is already an alias of "${owner}" in group "${group}".`))
    process.exit(1)
  }
  // Value via hidden prompt: passing it through argv would leak into shell
  // history and ps output.
  const value = await hiddenPrompt(`Value for ${name}: `)
  await manageSecrets.saveSecret(vault, group, { name, value })
  console.log(ui.ok(`${ui.bold(name)} saved to group "${group}".`))
}

export async function cmdGet(
  name: string | undefined,
  groupFlag?: string,
  copy = false,
): Promise<void> {
  if (!name) {
    console.error('Usage: key get NAME [--group group] [--copy]')
    process.exit(1)
  }
  const vault = await unlockVault()
  const group = resolveGroup(groupFlag)
  const resolved = resolveSecret(vault.data, group, name)
  if (!resolved) {
    console.error(uiErr.bad(`"${name}" does not exist in group "${group}".`))
    process.exit(1)
  }
  if (copy) {
    const { CLIPBOARD_CLEAR_SECONDS, copyToClipboard } = await import('../clipboard.ts')
    try {
      const tool = await copyToClipboard(resolved.secret.value)
      console.log(ui.ok(`${ui.bold(name)} copied to clipboard via ${tool} ${ui.dim(`(clears in ${CLIPBOARD_CLEAR_SECONDS}s)`)}.`))
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err))
      process.exit(1)
    }
    return
  }
  process.stdout.write(resolved.secret.value + (process.stdout.isTTY ? '\n' : ''))
}

export async function cmdList(groupFlag?: string): Promise<void> {
  const vault = await unlockVault()
  const printGroup = (group: string, indent: string) => {
    for (const [name, secret] of listSecrets(vault.data, group)) {
      const aliases = secret.aliases?.length
        ? ui.dim(`  (aliases: ${secret.aliases.join(', ')})`)
        : ''
      console.log(`${indent}${name}${aliases}`)
    }
  }
  if (groupFlag) {
    printGroup(groupFlag, '')
    return
  }
  for (const group of listGroups(vault.data)) {
    console.log(`${ui.bold(ui.cyan(group))} ${ui.dim(`(${listSecrets(vault.data, group).length})`)}`)
    printGroup(group, '  ')
  }
}

export async function cmdRm(name: string | undefined, groupFlag?: string): Promise<void> {
  if (!name) {
    console.error('Usage: key rm NAME [--group group]')
    process.exit(1)
  }
  const vault = await unlockVault()
  const group = resolveGroup(groupFlag)
  if (!getSecret(vault.data, group, name)) {
    console.error(uiErr.bad(`"${name}" does not exist in group "${group}".`))
    process.exit(1)
  }
  if (!(await confirmPrompt(`Remove ${name} from group "${group}"?`))) {
    console.log(ui.dim('Nothing changed.'))
    return
  }
  await manageSecrets.deleteSecret(vault, group, name)
  console.log(ui.ok(`${ui.bold(name)} removed.`))
}

// key alias NAME            → list aliases
// key alias add NAME A B    → add aliases
// key alias rm NAME A B     → remove aliases
// key alias move NAME DEST  → NAME (and its aliases) become aliases of DEST
export async function cmdAlias(args: string[], groupFlag?: string): Promise<void> {
  const usage =
    'Usage: key alias NAME | key alias add NAME ALIAS... | key alias rm NAME ALIAS... | key alias move NAME DEST'
  const [first, ...rest] = args
  if (!first) {
    console.error(usage)
    process.exit(1)
  }

  const vault = await unlockVault()
  const group = resolveGroup(groupFlag)

  if (first === 'move') {
    const [source, target, extra] = rest
    if (!source || !target || extra) {
      console.error(usage)
      process.exit(1)
    }
    let plan: ReturnType<typeof manageSecrets.planMerge>
    try {
      plan = manageSecrets.planMerge(vault, group, source, target)
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err))
      process.exit(1)
    }
    console.log(`"${ui.bold(source)}" will become an alias of "${ui.bold(plan.target)}"${ui.group(group)}.`)
    if (plan.aliasesToMove.length > 0) {
      console.log(`Its aliases move along: ${plan.aliasesToMove.join(', ')}.`)
    }
    if (plan.valuesDiffer) {
      console.log(ui.yellow(`The values differ — "${source}"'s value will be discarded.`))
    }
    if (!(await confirmPrompt('Proceed?'))) {
      console.log(ui.dim('Nothing changed.'))
      return
    }
    const { target: canonical, moved } = await manageSecrets.mergeAsAlias(
      vault,
      group,
      source,
      target,
    )
    console.log(ui.ok(`${moved.join(', ')} → ${ui.bold(canonical)}`) + ui.group(group))
    return
  }

  if (first === 'add' || first === 'rm') {
    const [name, ...aliases] = rest
    if (!name || aliases.length === 0) {
      console.error(usage)
      process.exit(1)
    }
    if (first === 'add') {
      const { added, conflicts } = await manageSecrets.addAliases(vault, group, name, aliases)
      if (added.length > 0) console.log(ui.ok(`${added.join(', ')} → ${ui.bold(name)}`) + ui.group(group))
      for (const { alias, owner } of conflicts) {
        console.error(uiErr.bad(`"${alias}" is already taken by "${owner}".`))
      }
      if (conflicts.length > 0 && added.length === 0) process.exit(1)
      return
    }
    const removed = await manageSecrets.removeAliases(vault, group, name, aliases)
    if (removed.length === 0) {
      console.error(uiErr.bad(`No matching aliases on "${name}".`))
      process.exit(1)
    }
    console.log(ui.ok(`removed ${removed.join(', ')} from ${ui.bold(name)}`) + ui.group(group))
    return
  }

  const secret = getSecret(vault.data, group, first)
  if (!secret) {
    console.error(uiErr.bad(`"${first}" does not exist in group "${group}".`))
    process.exit(1)
  }
  for (const alias of secret.aliases ?? []) console.log(alias)
}

export async function cmdPasswd(): Promise<void> {
  const vault = await unlockVault()
  const password = await hiddenPrompt('New password: ')
  if (password.length < config.minPasswordLength()) {
    console.error(
      uiErr.bad(
        `Password must be at least ${config.minPasswordLength()} characters (KEY_MIN_PASSWORD_LENGTH).`,
      ),
    )
    process.exit(1)
  }
  const confirmation = await hiddenPrompt('Confirm new password: ')
  if (password !== confirmation) {
    console.error(uiErr.bad('Passwords do not match.'))
    process.exit(1)
  }
  await vaultAccess.changePassword(vault, password)
  console.log(ui.ok('Password changed.') + ui.dim(' Session cleared; the next operation will ask for the new password.'))
}
