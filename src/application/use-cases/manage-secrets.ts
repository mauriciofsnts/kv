// Mutations on an unlocked vault. Each use case validates, applies the
// domain operation and persists — CLI and TUI share this exact logic.
import {
  NAME_PATTERN,
  addAliases,
  createGroup,
  getSecret,
  ownerOfName,
  removeAliases,
  removeSecret,
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

    async createGroup(vault: Vault, group: string): Promise<void> {
      createGroup(vault.data, group)
      await access.saveVault(vault)
    },
  }
}

export type ManageSecrets = ReturnType<typeof makeManageSecrets>
