import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ConfigStore, SessionCache } from '../src/application/ports.ts'
import { makeShareGroup, normalizeShareCode } from '../src/application/use-cases/share-group.ts'
import { makeVaultAccess } from '../src/application/use-cases/vault-access.ts'
import { DEFAULT_GROUP, addAliases, getSecret, setSecret } from '../src/domain/secret.ts'
import { nodeCrypto } from '../src/infrastructure/crypto/node-crypto.ts'
import { repositoryFor } from '../src/infrastructure/storage/repository-factory.ts'

let dir: string

function makeTestbed(location: () => string) {
  const sessions: SessionCache = {
    store: () => ({ volatile: true }),
    load: () => null,
    clear() {},
  }
  const config: ConfigStore = {
    vaultLocation: location,
    setVaultLocation() {},
    locationOverridden: () => false,
    minPasswordLength: () => 8,
    forceApply: () => false,
    setForceApply: () => {},
  }
  const access = makeVaultAccess({ crypto: nodeCrypto, sessions, config, repositoryFor })
  return { access, share: makeShareGroup(nodeCrypto, access) }
}

let testbed: ReturnType<typeof makeTestbed>

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'key-share-'))
  testbed = makeTestbed(() => join(dir, 'vault.enc'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('share/import', () => {
  test('roundtrip preserves values, notes and aliases', async () => {
    const { access, share } = testbed
    const vault = await access.initVault('password-123')
    setSecret(vault.data, DEFAULT_GROUP, 'DATABASE_URL', 'postgres://x', 'primary db')
    addAliases(vault.data, DEFAULT_GROUP, 'DATABASE_URL', ['DB_URL'])
    setSecret(vault.data, DEFAULT_GROUP, 'API_KEY', 'token-123')

    const { payload, code, names } = share.createShare(vault, DEFAULT_GROUP)
    expect(names.sort()).toEqual(['API_KEY', 'DATABASE_URL'])
    expect(payload.startsWith('kvshare1:')).toBe(true)
    expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/)

    const decoded = share.decodeShare(payload, code)
    expect(decoded.group).toBe(DEFAULT_GROUP)
    expect(decoded.secrets['DATABASE_URL']).toEqual({
      value: 'postgres://x',
      note: 'primary db',
      aliases: ['DB_URL'],
    })
    expect(decoded.secrets['API_KEY']).toEqual({ value: 'token-123' })
  })

  test('code is forgiving about case, dashes and spaces', async () => {
    const { access, share } = testbed
    const vault = await access.initVault('password-123')
    setSecret(vault.data, DEFAULT_GROUP, 'A', '1')
    const { payload, code } = share.createShare(vault, DEFAULT_GROUP)

    const sloppy = code.toLowerCase().replace(/-/g, ' ')
    expect(share.decodeShare(payload, sloppy).secrets['A']?.value).toBe('1')
    expect(normalizeShareCode(sloppy)).toBe(code.replace(/-/g, ''))
  })

  test('wrong code fails cleanly', async () => {
    const { access, share } = testbed
    const vault = await access.initVault('password-123')
    setSecret(vault.data, DEFAULT_GROUP, 'A', '1')
    const { payload } = share.createShare(vault, DEFAULT_GROUP)
    expect(() => share.decodeShare(payload, 'AAAA-AAAA-AAAA-AAAA')).toThrow(
      'Wrong share code or corrupted payload.',
    )
  })

  test('garbage payloads are rejected', async () => {
    const { share } = testbed
    expect(() => share.decodeShare('not-a-share', 'AAAA')).toThrow('Not a kv share payload')
    expect(() => share.decodeShare('kvshare1:AAAA', 'AAAA')).toThrow('truncated')
  })

  test('legacy keyshare1 payloads still import', async () => {
    const { access, share } = testbed
    const vault = await access.initVault('password-123')
    setSecret(vault.data, DEFAULT_GROUP, 'A', '1')
    const { payload, code } = share.createShare(vault, DEFAULT_GROUP)

    const legacy = payload.replace(/^kvshare1:/, 'keyshare1:')
    expect(share.decodeShare(legacy, code).secrets['A']?.value).toBe('1')
  })

  test('empty or missing group cannot be shared', async () => {
    const { access, share } = testbed
    const vault = await access.initVault('password-123')
    expect(() => share.createShare(vault, 'nope')).toThrow('empty or does not exist')
  })

  test('import merges: adds, replaces, skips alias collisions, persists', async () => {
    const { access, share } = testbed
    const sender = await access.initVault('password-123')
    setSecret(sender.data, 'proj', 'NEW_ONE', 'n1')
    setSecret(sender.data, 'proj', 'EXISTING', 'from-share')
    setSecret(sender.data, 'proj', 'TAKEN', 'conflict')
    const { payload, code } = share.createShare(sender, 'proj')
    const decoded = share.decodeShare(payload, code)

    // Receiver vault in a separate location.
    const receiverBed = makeTestbed(() => join(dir, 'receiver.enc'))
    const receiver = await receiverBed.access.initVault('other-pass-123')
    setSecret(receiver.data, 'proj', 'EXISTING', 'old-value')
    setSecret(receiver.data, 'proj', 'HOLDER', 'x')
    addAliases(receiver.data, 'proj', 'HOLDER', ['TAKEN'])

    const result = await receiverBed.share.importShare(receiver, 'proj', decoded)
    expect(result.added).toEqual(['NEW_ONE'])
    expect(result.replaced).toEqual(['EXISTING'])
    expect(result.skipped).toEqual([{ name: 'TAKEN', owner: 'HOLDER' }])

    const reopened = await receiverBed.access.openWithPassword('other-pass-123')
    expect(getSecret(reopened.data, 'proj', 'NEW_ONE')?.value).toBe('n1')
    expect(getSecret(reopened.data, 'proj', 'EXISTING')?.value).toBe('from-share')
    expect(getSecret(reopened.data, 'proj', 'TAKEN')).toBeUndefined()
  })

  test('incoming aliases that collide are dropped, others kept', async () => {
    const { access, share } = testbed
    const sender = await access.initVault('password-123')
    setSecret(sender.data, 'g', 'DB', 'v')
    addAliases(sender.data, 'g', 'DB', ['DB_URL', 'STOLEN'])
    const { payload, code } = share.createShare(sender, 'g')
    const decoded = share.decodeShare(payload, code)

    const receiverBed = makeTestbed(() => join(dir, 'receiver2.enc'))
    const receiver = await receiverBed.access.initVault('other-pass-123')
    setSecret(receiver.data, 'g', 'OTHER', 'x')
    addAliases(receiver.data, 'g', 'OTHER', ['STOLEN'])

    await receiverBed.share.importShare(receiver, 'g', decoded)
    expect(getSecret(receiver.data, 'g', 'DB')?.aliases).toEqual(['DB_URL'])
  })

  test('two shares of the same group produce different payloads and codes', async () => {
    const { access, share } = testbed
    const vault = await access.initVault('password-123')
    setSecret(vault.data, DEFAULT_GROUP, 'A', '1')
    const first = share.createShare(vault, DEFAULT_GROUP)
    const second = share.createShare(vault, DEFAULT_GROUP)
    expect(first.payload).not.toBe(second.payload)
    expect(first.code).not.toBe(second.code)
  })
})
