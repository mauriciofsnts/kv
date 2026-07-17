import {
  type EncryptedEnvelope,
  type KdfParams,
  SCRYPT_PARAMS,
  decrypt,
  deriveKey,
  encrypt,
  newSalt,
} from './crypto.ts'
import { vaultLocation } from './paths.ts'
import { VaultExistsError, type VaultStorage, storageFor } from './storage.ts'

export { VaultExistsError, VaultNotFoundError } from './storage.ts'

export interface Secret {
  value: string
  updatedAt: string
  note?: string
  // Alternative env var names that resolve to this secret's value
  // (e.g. DB_URL and POSTGRES_URL sharing the same connection string).
  aliases?: string[]
}

export interface VaultData {
  groups: Record<string, Record<string, Secret>>
}

export const DEFAULT_GROUP = 'default'

export const NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

export interface Vault {
  data: VaultData
  key: Buffer
  kdf: KdfParams
  storage: VaultStorage
}

// Accepts a VaultStorage, a location string (path or database URL), or
// nothing (resolved location: env > config > default file).
function resolveStorage(target?: VaultStorage | string): VaultStorage {
  if (target === undefined) return storageFor(vaultLocation())
  return typeof target === 'string' ? storageFor(target) : target
}

export async function vaultExists(target?: VaultStorage | string): Promise<boolean> {
  return resolveStorage(target).exists()
}

export async function readEnvelope(target?: VaultStorage | string): Promise<EncryptedEnvelope> {
  return resolveStorage(target).read()
}

export async function createVault(
  password: string,
  target?: VaultStorage | string,
): Promise<Vault> {
  const storage = resolveStorage(target)
  if (await storage.exists()) throw new VaultExistsError(storage.location)
  const salt = newSalt()
  const kdf: KdfParams = { algo: 'scrypt', salt: salt.toString('base64'), ...SCRYPT_PARAMS }
  const vault: Vault = {
    data: { groups: { [DEFAULT_GROUP]: {} } },
    key: deriveKey(password, salt),
    kdf,
    storage,
  }
  await saveVault(vault)
  return vault
}

export async function openVaultWithPassword(
  password: string,
  target?: VaultStorage | string,
): Promise<Vault> {
  const storage = resolveStorage(target)
  const envelope = await storage.read()
  const key = deriveKey(password, Buffer.from(envelope.kdf.salt, 'base64'), envelope.kdf)
  return openVaultWithKey(key, storage, envelope)
}

export async function openVaultWithKey(
  key: Buffer,
  target?: VaultStorage | string,
  envelope?: EncryptedEnvelope,
): Promise<Vault> {
  const storage = resolveStorage(target)
  const resolvedEnvelope = envelope ?? (await storage.read())
  const data = JSON.parse(decrypt(resolvedEnvelope, key)) as VaultData
  return { data, key, kdf: resolvedEnvelope.kdf, storage }
}

export async function saveVault(vault: Vault): Promise<void> {
  const envelope = encrypt(JSON.stringify(vault.data), vault.key, vault.kdf)
  await vault.storage.write(envelope)
}

export async function rekeyVault(vault: Vault, newPassword: string): Promise<Vault> {
  const salt = newSalt()
  const rekeyed: Vault = {
    ...vault,
    key: deriveKey(newPassword, salt),
    kdf: { algo: 'scrypt', salt: salt.toString('base64'), ...SCRYPT_PARAMS },
  }
  await saveVault(rekeyed)
  return rekeyed
}

export function setSecret(
  vault: Vault,
  group: string,
  name: string,
  value: string,
  note?: string,
  aliases?: string[],
): void {
  vault.data.groups[group] ??= {}
  const previous = vault.data.groups[group][name]
  vault.data.groups[group][name] = {
    value,
    updatedAt: new Date().toISOString(),
    ...(note ? { note } : {}),
    ...(aliases !== undefined
      ? aliases.length > 0
        ? { aliases }
        : {}
      : previous?.aliases?.length
        ? { aliases: previous.aliases }
        : {}),
  }
}

export function getSecret(vault: Vault, group: string, name: string): Secret | undefined {
  return vault.data.groups[group]?.[name]
}

// Resolves a name to a secret, matching either the canonical name or any of
// its aliases. Returns the canonical name alongside the secret.
export function resolveSecret(
  vault: Vault,
  group: string,
  name: string,
): { name: string; secret: Secret } | undefined {
  const groupSecrets = vault.data.groups[group]
  if (!groupSecrets) return undefined
  const direct = groupSecrets[name]
  if (direct) return { name, secret: direct }
  for (const [canonical, secret] of Object.entries(groupSecrets)) {
    if (secret.aliases?.includes(name)) return { name: canonical, secret }
  }
  return undefined
}

// Canonical name that owns `name` in the group, either directly or as an
// alias — used to detect collisions before adding names/aliases.
export function ownerOfName(vault: Vault, group: string, name: string): string | undefined {
  return resolveSecret(vault, group, name)?.name
}

export function addAliases(
  vault: Vault,
  group: string,
  name: string,
  aliases: string[],
): { added: string[]; conflicts: { alias: string; owner: string }[] } {
  const secret = getSecret(vault, group, name)
  if (!secret) throw new Error(`"${name}" does not exist in group "${group}".`)
  const added: string[] = []
  const conflicts: { alias: string; owner: string }[] = []
  for (const alias of aliases) {
    const owner = ownerOfName(vault, group, alias)
    if (owner === name) continue
    if (owner) {
      conflicts.push({ alias, owner })
      continue
    }
    secret.aliases = [...(secret.aliases ?? []), alias]
    added.push(alias)
  }
  if (added.length > 0) secret.updatedAt = new Date().toISOString()
  return { added, conflicts }
}

export function removeAliases(
  vault: Vault,
  group: string,
  name: string,
  aliases: string[],
): string[] {
  const secret = getSecret(vault, group, name)
  if (!secret) throw new Error(`"${name}" does not exist in group "${group}".`)
  const removed = (secret.aliases ?? []).filter((a) => aliases.includes(a))
  if (removed.length > 0) {
    const remaining = (secret.aliases ?? []).filter((a) => !aliases.includes(a))
    if (remaining.length > 0) secret.aliases = remaining
    else delete secret.aliases
    secret.updatedAt = new Date().toISOString()
  }
  return removed
}

export function removeSecret(vault: Vault, group: string, name: string): boolean {
  const groupSecrets = vault.data.groups[group]
  if (!groupSecrets || !(name in groupSecrets)) return false
  delete groupSecrets[name]
  return true
}

export function listGroups(vault: Vault): string[] {
  return Object.keys(vault.data.groups).sort()
}

export function listSecrets(vault: Vault, group: string): [string, Secret][] {
  return Object.entries(vault.data.groups[group] ?? {}).sort(([a], [b]) => a.localeCompare(b))
}

export function removeGroup(vault: Vault, group: string): boolean {
  if (!(group in vault.data.groups) || group === DEFAULT_GROUP) return false
  delete vault.data.groups[group]
  return true
}
