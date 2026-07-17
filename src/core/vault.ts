import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import {
  type EncryptedEnvelope,
  type KdfParams,
  SCRYPT_PARAMS,
  decrypt,
  deriveKey,
  encrypt,
  newSalt,
} from './crypto.ts'
import { vaultPath } from './paths.ts'

export interface Secret {
  value: string
  updatedAt: string
  note?: string
}

export interface VaultData {
  groups: Record<string, Record<string, Secret>>
}

export const DEFAULT_GROUP = 'default'

export class VaultNotFoundError extends Error {
  constructor(path: string) {
    super(`Cofre não encontrado em ${path}. Rode \`key init\` para criar um.`)
    this.name = 'VaultNotFoundError'
  }
}

export class VaultExistsError extends Error {
  constructor(path: string) {
    super(`Já existe um cofre em ${path}.`)
    this.name = 'VaultExistsError'
  }
}

export interface Vault {
  data: VaultData
  key: Buffer
  kdf: KdfParams
  path: string
}

export function vaultExists(path = vaultPath()): boolean {
  return existsSync(path)
}

export function readEnvelope(path = vaultPath()): EncryptedEnvelope {
  if (!existsSync(path)) throw new VaultNotFoundError(path)
  return JSON.parse(readFileSync(path, 'utf8')) as EncryptedEnvelope
}

export function createVault(password: string, path = vaultPath()): Vault {
  if (existsSync(path)) throw new VaultExistsError(path)
  const salt = newSalt()
  const kdf: KdfParams = { algo: 'scrypt', salt: salt.toString('base64'), ...SCRYPT_PARAMS }
  const vault: Vault = {
    data: { groups: { [DEFAULT_GROUP]: {} } },
    key: deriveKey(password, salt),
    kdf,
    path,
  }
  saveVault(vault)
  return vault
}

export function openVaultWithPassword(password: string, path = vaultPath()): Vault {
  const envelope = readEnvelope(path)
  const key = deriveKey(password, Buffer.from(envelope.kdf.salt, 'base64'), envelope.kdf)
  return openVaultWithKey(key, path, envelope)
}

export function openVaultWithKey(
  key: Buffer,
  path = vaultPath(),
  envelope = readEnvelope(path),
): Vault {
  const data = JSON.parse(decrypt(envelope, key)) as VaultData
  return { data, key, kdf: envelope.kdf, path }
}

// Escrita atômica: .tmp + rename, preservando a versão anterior em .bak.
export function saveVault(vault: Vault): void {
  const envelope = encrypt(JSON.stringify(vault.data), vault.key, vault.kdf)
  const serialized = JSON.stringify(envelope, null, 2) + '\n'
  mkdirSync(dirname(vault.path), { recursive: true, mode: 0o700 })
  if (existsSync(vault.path)) copyFileSync(vault.path, vault.path + '.bak')
  const tmp = vault.path + '.tmp'
  writeFileSync(tmp, serialized, { mode: 0o600 })
  renameSync(tmp, vault.path)
}

export function rekeyVault(vault: Vault, newPassword: string): Vault {
  const salt = newSalt()
  const rekeyed: Vault = {
    ...vault,
    key: deriveKey(newPassword, salt),
    kdf: { algo: 'scrypt', salt: salt.toString('base64'), ...SCRYPT_PARAMS },
  }
  saveVault(rekeyed)
  return rekeyed
}

export function setSecret(
  vault: Vault,
  group: string,
  name: string,
  value: string,
  note?: string,
): void {
  vault.data.groups[group] ??= {}
  vault.data.groups[group][name] = {
    value,
    updatedAt: new Date().toISOString(),
    ...(note ? { note } : {}),
  }
}

export function getSecret(vault: Vault, group: string, name: string): Secret | undefined {
  return vault.data.groups[group]?.[name]
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
