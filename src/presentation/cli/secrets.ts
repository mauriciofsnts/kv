import { config, manageSecrets, vaultAccess } from '../../composition.ts'
import {
  getSecret,
  listGroups,
  listSecrets,
  ownerOfName,
  resolveSecret,
} from '../../domain/secret.ts'
import { confirmPrompt, hiddenPrompt } from './prompt.ts'
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
    console.error(`"${name}" is already an alias of "${owner}" in group "${group}".`)
    process.exit(1)
  }
  // Value via hidden prompt: passing it through argv would leak into shell
  // history and ps output.
  const value = await hiddenPrompt(`Value for ${name}: `)
  await manageSecrets.saveSecret(vault, group, { name, value })
  console.log(`✓ ${name} saved to group "${group}".`)
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
    console.error(`"${name}" does not exist in group "${group}".`)
    process.exit(1)
  }
  if (copy) {
    const { CLIPBOARD_CLEAR_SECONDS, copyToClipboard } = await import('../clipboard.ts')
    try {
      const tool = await copyToClipboard(resolved.secret.value)
      console.log(`✓ ${name} copied to clipboard via ${tool} (clears in ${CLIPBOARD_CLEAR_SECONDS}s).`)
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
      const aliases = secret.aliases?.length ? `  (aliases: ${secret.aliases.join(', ')})` : ''
      console.log(`${indent}${name}${aliases}`)
    }
  }
  if (groupFlag) {
    printGroup(groupFlag, '')
    return
  }
  for (const group of listGroups(vault.data)) {
    console.log(`${group} (${listSecrets(vault.data, group).length})`)
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
    console.error(`"${name}" does not exist in group "${group}".`)
    process.exit(1)
  }
  if (!(await confirmPrompt(`Remove ${name} from group "${group}"?`))) {
    console.log('Nothing changed.')
    return
  }
  await manageSecrets.deleteSecret(vault, group, name)
  console.log(`✓ ${name} removed.`)
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
    console.log(`"${source}" will become an alias of "${plan.target}" [group: ${group}].`)
    if (plan.aliasesToMove.length > 0) {
      console.log(`Its aliases move along: ${plan.aliasesToMove.join(', ')}.`)
    }
    if (plan.valuesDiffer) {
      console.log(`The values differ — "${source}"'s value will be discarded.`)
    }
    if (!(await confirmPrompt('Proceed?'))) {
      console.log('Nothing changed.')
      return
    }
    const { target: canonical, moved } = await manageSecrets.mergeAsAlias(
      vault,
      group,
      source,
      target,
    )
    console.log(`✓ ${moved.join(', ')} → ${canonical} [group: ${group}]`)
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
      if (added.length > 0) console.log(`✓ ${added.join(', ')} → ${name} [group: ${group}]`)
      for (const { alias, owner } of conflicts) {
        console.error(`✗ "${alias}" is already taken by "${owner}".`)
      }
      if (conflicts.length > 0 && added.length === 0) process.exit(1)
      return
    }
    const removed = await manageSecrets.removeAliases(vault, group, name, aliases)
    if (removed.length === 0) {
      console.error(`No matching aliases on "${name}".`)
      process.exit(1)
    }
    console.log(`✓ removed ${removed.join(', ')} from ${name} [group: ${group}]`)
    return
  }

  const secret = getSecret(vault.data, group, first)
  if (!secret) {
    console.error(`"${first}" does not exist in group "${group}".`)
    process.exit(1)
  }
  for (const alias of secret.aliases ?? []) console.log(alias)
}

export async function cmdPasswd(): Promise<void> {
  const vault = await unlockVault()
  const password = await hiddenPrompt('New password: ')
  if (password.length < config.minPasswordLength()) {
    console.error(
      `Password must be at least ${config.minPasswordLength()} characters (KEY_MIN_PASSWORD_LENGTH).`,
    )
    process.exit(1)
  }
  const confirmation = await hiddenPrompt('Confirm new password: ')
  if (password !== confirmation) {
    console.error('Passwords do not match.')
    process.exit(1)
  }
  await vaultAccess.changePassword(vault, password)
  console.log('✓ Password changed. Session cleared; the next operation will ask for the new password.')
}
