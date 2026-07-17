import { minPasswordLength } from '../core/paths.ts'
import { clearSession } from '../core/session.ts'
import {
  NAME_PATTERN,
  addAliases,
  getSecret,
  listGroups,
  listSecrets,
  ownerOfName,
  rekeyVault,
  removeAliases,
  removeSecret,
  resolveSecret,
  saveVault,
  setSecret,
} from '../core/vault.ts'
import { confirmPrompt, hiddenPrompt } from './prompt.ts'
import { resolveGroup, unlockVault } from './unlock.ts'

export async function cmdSet(name: string | undefined, groupFlag?: string): Promise<void> {
  if (!name) {
    console.error('Usage: key set NAME [--group group]')
    process.exit(1)
  }
  const vault = await unlockVault()
  const group = resolveGroup(groupFlag)
  const owner = ownerOfName(vault, group, name)
  if (owner && owner !== name) {
    console.error(`"${name}" is already an alias of "${owner}" in group "${group}".`)
    process.exit(1)
  }
  // Value via hidden prompt: passing it through argv would leak into shell
  // history and ps output.
  const value = await hiddenPrompt(`Value for ${name}: `)
  setSecret(vault, group, name, value)
  await saveVault(vault)
  console.log(`✓ ${name} saved to group "${group}".`)
}

export async function cmdGet(name: string | undefined, groupFlag?: string): Promise<void> {
  if (!name) {
    console.error('Usage: key get NAME [--group group]')
    process.exit(1)
  }
  const vault = await unlockVault()
  const group = resolveGroup(groupFlag)
  const resolved = resolveSecret(vault, group, name)
  if (!resolved) {
    console.error(`"${name}" does not exist in group "${group}".`)
    process.exit(1)
  }
  process.stdout.write(resolved.secret.value + (process.stdout.isTTY ? '\n' : ''))
}

export async function cmdList(groupFlag?: string): Promise<void> {
  const vault = await unlockVault()
  const printGroup = (group: string, indent: string) => {
    for (const [name, secret] of listSecrets(vault, group)) {
      const aliases = secret.aliases?.length ? `  (aliases: ${secret.aliases.join(', ')})` : ''
      console.log(`${indent}${name}${aliases}`)
    }
  }
  if (groupFlag) {
    printGroup(groupFlag, '')
    return
  }
  for (const group of listGroups(vault)) {
    console.log(`${group} (${listSecrets(vault, group).length})`)
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
  if (!getSecret(vault, group, name)) {
    console.error(`"${name}" does not exist in group "${group}".`)
    process.exit(1)
  }
  if (!(await confirmPrompt(`Remove ${name} from group "${group}"?`))) {
    console.log('Nothing changed.')
    return
  }
  removeSecret(vault, group, name)
  await saveVault(vault)
  console.log(`✓ ${name} removed.`)
}

// key alias NAME            → list aliases
// key alias add NAME A B    → add aliases
// key alias rm NAME A B     → remove aliases
export async function cmdAlias(args: string[], groupFlag?: string): Promise<void> {
  const usage = 'Usage: key alias NAME | key alias add NAME ALIAS... | key alias rm NAME ALIAS...'
  const [first, ...rest] = args
  if (!first) {
    console.error(usage)
    process.exit(1)
  }

  const vault = await unlockVault()
  const group = resolveGroup(groupFlag)

  if (first === 'add' || first === 'rm') {
    const [name, ...aliases] = rest
    if (!name || aliases.length === 0) {
      console.error(usage)
      process.exit(1)
    }
    if (!getSecret(vault, group, name)) {
      console.error(`"${name}" does not exist in group "${group}".`)
      process.exit(1)
    }
    if (first === 'add') {
      const invalid = aliases.filter((a) => !NAME_PATTERN.test(a))
      if (invalid.length > 0) {
        console.error(`Invalid alias name(s): ${invalid.join(', ')}`)
        process.exit(1)
      }
      const { added, conflicts } = addAliases(vault, group, name, aliases)
      if (added.length > 0) await saveVault(vault)
      if (added.length > 0) console.log(`✓ ${added.join(', ')} → ${name} [group: ${group}]`)
      for (const { alias, owner } of conflicts) {
        console.error(`✗ "${alias}" is already taken by "${owner}".`)
      }
      if (conflicts.length > 0 && added.length === 0) process.exit(1)
      return
    }
    const removed = removeAliases(vault, group, name, aliases)
    if (removed.length === 0) {
      console.error(`No matching aliases on "${name}".`)
      process.exit(1)
    }
    await saveVault(vault)
    console.log(`✓ removed ${removed.join(', ')} from ${name} [group: ${group}]`)
    return
  }

  const secret = getSecret(vault, group, first)
  if (!secret) {
    console.error(`"${first}" does not exist in group "${group}".`)
    process.exit(1)
  }
  for (const alias of secret.aliases ?? []) console.log(alias)
}

export async function cmdPasswd(): Promise<void> {
  const vault = await unlockVault()
  const minLength = minPasswordLength()
  const password = await hiddenPrompt('New password: ')
  if (password.length < minLength) {
    console.error(`Password must be at least ${minLength} characters (KEY_MIN_PASSWORD_LENGTH).`)
    process.exit(1)
  }
  const confirmation = await hiddenPrompt('Confirm new password: ')
  if (password !== confirmation) {
    console.error('Passwords do not match.')
    process.exit(1)
  }
  await rekeyVault(vault, password)
  clearSession()
  console.log('✓ Password changed. Session cleared; the next operation will ask for the new password.')
}
