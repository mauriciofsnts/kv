// Mutations on an unlocked vault. Each use case validates, applies the
// domain operation and persists — CLI and TUI share this exact logic.
import {
  NAME_PATTERN,
  addAliases,
  createGroup,
  getSecret,
  mergeAsAlias,
  ownerOfName,
  removeAliases,
  removeSecret,
  resolveSecret,
  setSecret,
} from '../../domain/secret.ts'
import type { Vault } from '../vault.ts'
import type { VaultAccess } from './vault-access.ts'

export interface SaveSecretInput {
  name: string
  value: string
  note?: string
  aliases?: string[]
  // Set when editing: a different name renames the secret.
  previousName?: string
}

export interface ImportPlan {
  add: string[]
  replace: string[]
  unchanged: string[]
  conflicts: { name: string; owner: string }[]
}

export interface MergePlan {
  // Canonical name of the target (it may have been given by one of its aliases).
  target: string
  // The source's value will be discarded; true when that actually loses data.
  valuesDiffer: boolean
  // The source's own aliases, which follow it onto the target.
  aliasesToMove: string[]
}

export function makeManageSecrets(access: Pick<VaultAccess, 'saveVault'>) {
  return {
    async saveSecret(vault: Vault, group: string, input: SaveSecretInput): Promise<string> {
      const name = input.name.trim()
      if (!NAME_PATTERN.test(name)) {
        throw new Error('Invalid name: use letters, numbers and _ (cannot start with a number).')
      }
      const aliases = (input.aliases ?? []).map((a) => a.trim()).filter((a) => a && a !== name)
      for (const alias of aliases) {
        if (!NAME_PATTERN.test(alias)) {
          throw new Error(`Invalid alias "${alias}": use letters, numbers and _.`)
        }
        const owner = ownerOfName(vault.data, group, alias)
        if (owner && owner !== name && owner !== input.previousName) {
          throw new Error(`Alias "${alias}" is already taken by "${owner}".`)
        }
      }
      const owner = ownerOfName(vault.data, group, name)
      if (owner && owner !== name && owner !== input.previousName) {
        throw new Error(`"${name}" is already an alias of "${owner}".`)
      }
      if (input.previousName && input.previousName !== name) {
        removeSecret(vault.data, group, input.previousName)
      }
      setSecret(
        vault.data,
        group,
        name,
        input.value,
        input.note?.trim() || undefined,
        input.aliases !== undefined ? aliases : undefined,
      )
      await access.saveVault(vault)
      return name
    },

    async deleteSecret(vault: Vault, group: string, name: string): Promise<boolean> {
      const removed = removeSecret(vault.data, group, name)
      if (removed) await access.saveVault(vault)
      return removed
    },

    async addAliases(
      vault: Vault,
      group: string,
      name: string,
      aliases: string[],
    ): Promise<{ added: string[]; conflicts: { alias: string; owner: string }[] }> {
      const invalid = aliases.filter((a) => !NAME_PATTERN.test(a))
      if (invalid.length > 0) throw new Error(`Invalid alias name(s): ${invalid.join(', ')}`)
      if (!getSecret(vault.data, group, name)) {
        throw new Error(`"${name}" does not exist in group "${group}".`)
      }
      const result = addAliases(vault.data, group, name, aliases)
      if (result.added.length > 0) await access.saveVault(vault)
      return result
    },

    async removeAliases(
      vault: Vault,
      group: string,
      name: string,
      aliases: string[],
    ): Promise<string[]> {
      if (!getSecret(vault.data, group, name)) {
        throw new Error(`"${name}" does not exist in group "${group}".`)
      }
      const removed = removeAliases(vault.data, group, name, aliases)
      if (removed.length > 0) await access.saveVault(vault)
      return removed
    },

    // Classifies a "move as alias" without touching anything, so the caller
    // can confirm (especially the value loss) before mergeAsAlias applies it.
    planMerge(vault: Vault, group: string, source: string, target: string): MergePlan {
      const sourceSecret = getSecret(vault.data, group, source)
      if (!sourceSecret) {
        const owner = ownerOfName(vault.data, group, source)
        throw new Error(
          owner
            ? `"${source}" is an alias of "${owner}" — only canonical names can be moved.`
            : `"${source}" does not exist in group "${group}".`,
        )
      }
      const resolved = resolveSecret(vault.data, group, target)
      if (!resolved) throw new Error(`"${target}" does not exist in group "${group}".`)
      if (resolved.name === source) throw new Error(`Cannot move "${source}" onto itself.`)
      return {
        target: resolved.name,
        valuesDiffer: resolved.secret.value !== sourceSecret.value,
        aliasesToMove: [...(sourceSecret.aliases ?? [])],
      }
    },

    async mergeAsAlias(
      vault: Vault,
      group: string,
      source: string,
      target: string,
    ): Promise<{ target: string; moved: string[] }> {
      const plan = this.planMerge(vault, group, source, target)
      const moved = mergeAsAlias(vault.data, group, source, plan.target)
      await access.saveVault(vault)
      return { target: plan.target, moved }
    },

    async createGroup(vault: Vault, group: string): Promise<void> {
      createGroup(vault.data, group)
      await access.saveVault(vault)
    },

    // Bulk import of name/value pairs (the `kv scan` flow). planImport
    // classifies without touching anything; importEntries applies the
    // non-conflicting part of the plan with a single save.
    planImport(vault: Vault, group: string, entries: { name: string; value: string }[]): ImportPlan {
      const plan: ImportPlan = { add: [], replace: [], unchanged: [], conflicts: [] }
      for (const { name, value } of entries) {
        const owner = ownerOfName(vault.data, group, name)
        if (owner && owner !== name) {
          plan.conflicts.push({ name, owner })
          continue
        }
        const existing = getSecret(vault.data, group, name)
        if (!existing) plan.add.push(name)
        else if (existing.value === value) plan.unchanged.push(name)
        else plan.replace.push(name)
      }
      return plan
    },

    async importEntries(
      vault: Vault,
      group: string,
      entries: { name: string; value: string }[],
    ): Promise<{ added: string[]; replaced: string[] }> {
      const plan = this.planImport(vault, group, entries)
      const toWrite = new Set([...plan.add, ...plan.replace])
      const added: string[] = []
      const replaced: string[] = []
      for (const { name, value } of entries) {
        if (!toWrite.has(name)) continue
        const existed = Boolean(getSecret(vault.data, group, name))
        setSecret(vault.data, group, name, value)
        ;(existed ? replaced : added).push(name)
      }
      if (added.length > 0 || replaced.length > 0) await access.saveVault(vault)
      return { added, replaced }
    },
  }
}

export type ManageSecrets = ReturnType<typeof makeManageSecrets>
