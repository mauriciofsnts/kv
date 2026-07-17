import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SCRYPT_PARAMS, deriveKey, encrypt, newSalt } from '../src/core/crypto.ts'
import { configPath, vaultLocation } from '../src/core/paths.ts'
import { VaultNotFoundError, storageFor } from '../src/core/storage.ts'
import {
  DEFAULT_GROUP,
  createVault,
  getSecret,
  openVaultWithPassword,
  saveVault,
  setSecret,
} from '../src/core/vault.ts'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'key-storage-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  delete process.env.KEY_VAULT_PATH
  delete process.env.XDG_CONFIG_HOME
})

function sampleEnvelope() {
  const salt = newSalt()
  const kdf = { algo: 'scrypt' as const, salt: salt.toString('base64'), ...SCRYPT_PARAMS }
  return encrypt('{"groups":{}}', deriveKey('pw', salt), kdf)
}

describe('storageFor', () => {
  test('plain paths use the file backend', () => {
    expect(storageFor('/tmp/x/vault.enc').kind).toBe('file')
    expect(storageFor('relative/vault.enc').kind).toBe('file')
  })

  test('database URLs use the database backend', () => {
    expect(storageFor('sqlite:///tmp/x.db').kind).toBe('database')
    expect(storageFor('postgres://user@host/db').kind).toBe('database')
    expect(storageFor('postgresql://user@host/db').kind).toBe('database')
    expect(storageFor('mysql://user@host/db').kind).toBe('database')
    expect(storageFor('mariadb://user@host/db').kind).toBe('database')
  })
})

describe('sqlite storage', () => {
  test('write/read/exists roundtrip', async () => {
    const storage = storageFor(`sqlite://${join(dir, 'vault.db')}`)
    expect(await storage.exists()).toBe(false)
    await expect(storage.read()).rejects.toThrow(VaultNotFoundError)

    const envelope = sampleEnvelope()
    await storage.write(envelope)
    expect(await storage.exists()).toBe(true)
    expect(await storage.read()).toEqual(envelope)
  })

  test('keeps the previous envelope on overwrite', async () => {
    const location = `sqlite://${join(dir, 'vault.db')}`
    const storage = storageFor(location)
    const first = sampleEnvelope()
    const second = sampleEnvelope()
    await storage.write(first)
    await storage.write(second)
    expect(await storage.read()).toEqual(second)

    const { Database } = await import('bun:sqlite')
    const db = new Database(join(dir, 'vault.db'))
    const row = db.query('SELECT previous FROM key_vault WHERE id = 1').get() as {
      previous: string
    }
    db.close()
    expect(JSON.parse(row.previous)).toEqual(first)
  })

  test('full vault flow over sqlite', async () => {
    const location = `sqlite://${join(dir, 'flow.db')}`
    const vault = await createVault('password', location)
    setSecret(vault, DEFAULT_GROUP, 'API_KEY', 'token123')
    await saveVault(vault)

    const reopened = await openVaultWithPassword('password', location)
    expect(getSecret(reopened, DEFAULT_GROUP, 'API_KEY')?.value).toBe('token123')
    expect(reopened.storage.kind).toBe('database')
  })
})

describe('vaultLocation', () => {
  test('env > config > default', () => {
    process.env.XDG_CONFIG_HOME = dir

    expect(vaultLocation()).toBe(join(dir, 'key', 'vault.enc'))

    mkdirSync(join(dir, 'key'), { recursive: true })
    writeFileSync(
      configPath(),
      JSON.stringify({ vault: 'sqlite:///somewhere/vault.db' }),
      { mode: 0o600 },
    )
    expect(vaultLocation()).toBe('sqlite:///somewhere/vault.db')

    process.env.KEY_VAULT_PATH = '/env/wins.enc'
    expect(vaultLocation()).toBe('/env/wins.enc')
  })

  test('corrupted config falls back to the default', () => {
    process.env.XDG_CONFIG_HOME = dir
    mkdirSync(join(dir, 'key'), { recursive: true })
    writeFileSync(configPath(), 'not json', { mode: 0o600 })
    expect(vaultLocation()).toBe(join(dir, 'key', 'vault.enc'))
  })
})
