import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ConfigStore, SessionCache } from '../src/application/ports.ts'
import { makeVaultAccess } from '../src/application/use-cases/vault-access.ts'
import { VaultNotFoundError } from '../src/domain/errors.ts'
import { DEFAULT_GROUP, getSecret, setSecret } from '../src/domain/secret.ts'
import { configPath, jsonConfigStore } from '../src/infrastructure/config/json-config-store.ts'
import { nodeCrypto } from '../src/infrastructure/crypto/node-crypto.ts'
import { repositoryFor } from '../src/infrastructure/storage/repository-factory.ts'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'key-storage-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  delete process.env.KV_VAULT_PATH
  delete process.env.XDG_CONFIG_HOME
})

function sampleEnvelope() {
  const kdf = nodeCrypto.newKdfParams()
  return nodeCrypto.encrypt('{"groups":{}}', nodeCrypto.deriveKey('pw', kdf), kdf)
}

describe('repositoryFor', () => {
  test('plain paths use the file backend', () => {
    expect(repositoryFor('/tmp/x/vault.enc').kind).toBe('file')
    expect(repositoryFor('relative/vault.enc').kind).toBe('file')
  })

  test('database URLs use the database backend', () => {
    expect(repositoryFor('sqlite:///tmp/x.db').kind).toBe('database')
    expect(repositoryFor('postgres://user@host/db').kind).toBe('database')
    expect(repositoryFor('postgresql://user@host/db').kind).toBe('database')
    expect(repositoryFor('mysql://user@host/db').kind).toBe('database')
    expect(repositoryFor('mariadb://user@host/db').kind).toBe('database')
  })
})

describe('sqlite repository', () => {
  test('write/read/exists roundtrip', async () => {
    const repository = repositoryFor(`sqlite://${join(dir, 'vault.db')}`)
    expect(await repository.exists()).toBe(false)
    await expect(repository.read()).rejects.toThrow(VaultNotFoundError)

    const envelope = sampleEnvelope()
    await repository.write(envelope)
    expect(await repository.exists()).toBe(true)
    expect(await repository.read()).toEqual(envelope)
  })

  test('keeps the previous envelope on overwrite', async () => {
    const repository = repositoryFor(`sqlite://${join(dir, 'vault.db')}`)
    const first = sampleEnvelope()
    const second = sampleEnvelope()
    await repository.write(first)
    await repository.write(second)
    expect(await repository.read()).toEqual(second)

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
    const sessions: SessionCache = {
      store: () => ({ volatile: true }),
      load: () => null,
      clear() {},
    }
    const config: ConfigStore = {
      vaultLocation: () => location,
      setVaultLocation() {},
      locationOverridden: () => false,
      minPasswordLength: () => 8,
    forceApply: () => false,
    setForceApply: () => {},
    }
    const access = makeVaultAccess({ crypto: nodeCrypto, sessions, config, repositoryFor })

    const vault = await access.initVault('password-123')
    setSecret(vault.data, DEFAULT_GROUP, 'API_KEY', 'token123')
    await access.saveVault(vault)

    const reopened = await access.openWithPassword('password-123')
    expect(getSecret(reopened.data, DEFAULT_GROUP, 'API_KEY')?.value).toBe('token123')
    expect(reopened.repository.kind).toBe('database')
  })
})

describe('vaultLocation', () => {
  test('env > config > default', () => {
    process.env.XDG_CONFIG_HOME = dir

    expect(jsonConfigStore.vaultLocation()).toBe(join(dir, 'kv', 'vault.enc'))

    jsonConfigStore.setVaultLocation('sqlite:///somewhere/vault.db')
    expect(jsonConfigStore.vaultLocation()).toBe('sqlite:///somewhere/vault.db')

    process.env.KV_VAULT_PATH = '/env/wins.enc'
    expect(jsonConfigStore.vaultLocation()).toBe('/env/wins.enc')
    expect(jsonConfigStore.locationOverridden()).toBe(true)
  })

  test('corrupted config falls back to the default', () => {
    process.env.XDG_CONFIG_HOME = dir
    mkdirSync(join(dir, 'kv'), { recursive: true })
    writeFileSync(configPath(), 'not json', { mode: 0o600 })
    expect(jsonConfigStore.vaultLocation()).toBe(join(dir, 'kv', 'vault.enc'))
  })
})
