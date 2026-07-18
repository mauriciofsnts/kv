import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ConfigStore, SessionCache } from '../src/application/ports.ts'
import { makeManageSecrets } from '../src/application/use-cases/manage-secrets.ts'
import { makeVaultAccess } from '../src/application/use-cases/vault-access.ts'
import { VaultExistsError, VaultNotFoundError, WrongPasswordError } from '../src/domain/errors.ts'
import {
  DEFAULT_GROUP,
  addAliases,
  getSecret,
  listGroups,
  listSecrets,
  mergeAsAlias,
  ownerOfName,
  removeAliases,
  removeGroup,
  removeSecret,
  resolveSecret,
  setSecret,
} from '../src/domain/secret.ts'
import { nodeCrypto } from '../src/infrastructure/crypto/node-crypto.ts'
import { repositoryFor } from '../src/infrastructure/storage/repository-factory.ts'

let dir: string
let path: string

// Use cases wired with real crypto + file storage, but in-memory session
// and a fixed config — the clean-arch seams make the fakes trivial.
function makeTestbed(location: () => string) {
  let sessionKey: Buffer | null = null
  const sessions: SessionCache = {
    store(key) {
      sessionKey = key
      return { volatile: true }
    },
    load: () => sessionKey,
    clear() {
      sessionKey = null
    },
  }
  const config: ConfigStore = {
    vaultLocation: location,
    setVaultLocation() {},
    locationOverridden: () => false,
    minPasswordLength: () => 8,
  }
  const access = makeVaultAccess({ crypto: nodeCrypto, sessions, config, repositoryFor })
  return { access, secrets: makeManageSecrets(access) }
}

let testbed: ReturnType<typeof makeTestbed>

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'key-vault-'))
  path = join(dir, 'vault.enc')
  testbed = makeTestbed(() => path)
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('vault access', () => {
  test('create + reopen with password', async () => {
    const { access } = testbed
    const vault = await access.initVault('password-123')
    setSecret(vault.data, DEFAULT_GROUP, 'POSTGRES_DB', 'mydb')
    await access.saveVault(vault)

    const reopened = await access.openWithPassword('password-123')
    expect(getSecret(reopened.data, DEFAULT_GROUP, 'POSTGRES_DB')?.value).toBe('mydb')
  })

  test('wrong password throws WrongPasswordError', async () => {
    const { access } = testbed
    await access.initVault('password-123')
    await expect(access.openWithPassword('wrong-password')).rejects.toThrow(WrongPasswordError)
  })

  test('init starts a session and openWithSession uses it', async () => {
    const { access } = testbed
    const vault = await access.initVault('password-123')
    setSecret(vault.data, DEFAULT_GROUP, 'X', '1')
    await access.saveVault(vault)

    const reopened = await access.openWithSession()
    expect(reopened).not.toBeNull()
    expect(getSecret(reopened!.data, DEFAULT_GROUP, 'X')?.value).toBe('1')
  })

  test('lock ends the session', async () => {
    const { access } = testbed
    await access.initVault('password-123')
    access.lock()
    expect(await access.openWithSession()).toBeNull()
  })

  test('does not overwrite an existing vault', async () => {
    const { access } = testbed
    await access.initVault('password-123')
    await expect(access.initVault('other-password')).rejects.toThrow(VaultExistsError)
  })

  test('missing vault', async () => {
    await expect(testbed.access.openWithPassword('password-123')).rejects.toThrow(
      VaultNotFoundError,
    )
  })

  test('init rejects short passwords (min from config)', async () => {
    await expect(testbed.access.initVault('short')).rejects.toThrow('at least 8 characters')
  })

  test('save keeps a .bak backup of the previous version', async () => {
    const { access } = testbed
    const vault = await access.initVault('password-123')
    setSecret(vault.data, DEFAULT_GROUP, 'A', '1')
    await access.saveVault(vault)
    expect(existsSync(path + '.bak')).toBe(true)
    expect(existsSync(path + '.tmp')).toBe(false)
  })

  test('changePassword invalidates the old password and clears the session', async () => {
    const { access } = testbed
    const vault = await access.initVault('old-password')
    setSecret(vault.data, DEFAULT_GROUP, 'A', '1')
    await access.saveVault(vault)
    await access.changePassword(vault, 'new-password')

    expect(await access.openWithSession()).toBeNull()
    await expect(access.openWithPassword('old-password')).rejects.toThrow(WrongPasswordError)
    const reopened = await access.openWithPassword('new-password')
    expect(getSecret(reopened.data, DEFAULT_GROUP, 'A')?.value).toBe('1')
  })

  test('changePassword also rekeys the .bak backup', async () => {
    const { access } = testbed
    const vault = await access.initVault('old-password')
    setSecret(vault.data, DEFAULT_GROUP, 'A', '1')
    await access.saveVault(vault)
    await access.changePassword(vault, 'new-password')

    // The backup must not remain decryptable with the compromised password.
    const backup = makeTestbed(() => path + '.bak')
    await expect(backup.access.openWithPassword('old-password')).rejects.toThrow(
      WrongPasswordError,
    )
    const reopened = await backup.access.openWithPassword('new-password')
    expect(getSecret(reopened.data, DEFAULT_GROUP, 'A')?.value).toBe('1')
  })
})

describe('manage secrets use cases', () => {
  test('saveSecret validates the name', async () => {
    const { access, secrets } = testbed
    const vault = await access.initVault('password-123')
    await expect(
      secrets.saveSecret(vault, DEFAULT_GROUP, { name: '1BAD', value: 'x' }),
    ).rejects.toThrow('Invalid name')
  })

  test('saveSecret rejects a name that is an alias of another secret', async () => {
    const { access, secrets } = testbed
    const vault = await access.initVault('password-123')
    await secrets.saveSecret(vault, DEFAULT_GROUP, {
      name: 'DATABASE_URL',
      value: 'x',
      aliases: ['DB_URL'],
    })
    await expect(
      secrets.saveSecret(vault, DEFAULT_GROUP, { name: 'DB_URL', value: 'y' }),
    ).rejects.toThrow('already an alias of "DATABASE_URL"')
  })

  test('saveSecret with previousName renames and persists', async () => {
    const { access, secrets } = testbed
    const vault = await access.initVault('password-123')
    await secrets.saveSecret(vault, DEFAULT_GROUP, { name: 'OLD', value: '1' })
    await secrets.saveSecret(vault, DEFAULT_GROUP, {
      name: 'NEW',
      value: '2',
      previousName: 'OLD',
    })

    const reopened = await access.openWithPassword('password-123')
    expect(getSecret(reopened.data, DEFAULT_GROUP, 'OLD')).toBeUndefined()
    expect(getSecret(reopened.data, DEFAULT_GROUP, 'NEW')?.value).toBe('2')
  })

  test('deleteSecret persists the removal', async () => {
    const { access, secrets } = testbed
    const vault = await access.initVault('password-123')
    await secrets.saveSecret(vault, DEFAULT_GROUP, { name: 'A', value: '1' })
    expect(await secrets.deleteSecret(vault, DEFAULT_GROUP, 'A')).toBe(true)
    expect(await secrets.deleteSecret(vault, DEFAULT_GROUP, 'MISSING')).toBe(false)

    const reopened = await access.openWithPassword('password-123')
    expect(getSecret(reopened.data, DEFAULT_GROUP, 'A')).toBeUndefined()
  })
})

describe('domain: secrets and groups', () => {
  test('groups: set creates group, list sorts, remove protects default', () => {
    const data = { groups: { [DEFAULT_GROUP]: {} } }
    setSecret(data, 'project-b', 'K', 'v')
    setSecret(data, 'project-a', 'K', 'v')
    expect(listGroups(data)).toEqual([DEFAULT_GROUP, 'project-a', 'project-b'])
    expect(removeGroup(data, 'project-b')).toBe(true)
    expect(removeGroup(data, DEFAULT_GROUP)).toBe(false)
  })

  test('remove secret and sorted listing', () => {
    const data = { groups: { [DEFAULT_GROUP]: {} } }
    setSecret(data, DEFAULT_GROUP, 'B_VAR', '2')
    setSecret(data, DEFAULT_GROUP, 'A_VAR', '1')
    expect(listSecrets(data, DEFAULT_GROUP).map(([n]) => n)).toEqual(['A_VAR', 'B_VAR'])
    expect(removeSecret(data, DEFAULT_GROUP, 'A_VAR')).toBe(true)
    expect(removeSecret(data, DEFAULT_GROUP, 'MISSING')).toBe(false)
  })
})

describe('domain: aliases', () => {
  const fresh = () => ({ groups: { [DEFAULT_GROUP]: {} } })

  test('resolveSecret matches canonical name and aliases', () => {
    const data = fresh()
    setSecret(data, DEFAULT_GROUP, 'DATABASE_URL', 'postgres://x')
    addAliases(data, DEFAULT_GROUP, 'DATABASE_URL', ['DB_URL', 'POSTGRES_URL'])

    expect(resolveSecret(data, DEFAULT_GROUP, 'DATABASE_URL')?.secret.value).toBe('postgres://x')
    expect(resolveSecret(data, DEFAULT_GROUP, 'DB_URL')?.name).toBe('DATABASE_URL')
    expect(resolveSecret(data, DEFAULT_GROUP, 'POSTGRES_URL')?.secret.value).toBe('postgres://x')
    expect(resolveSecret(data, DEFAULT_GROUP, 'NOPE')).toBeUndefined()
  })

  test('addAliases reports conflicts with existing names and aliases', () => {
    const data = fresh()
    setSecret(data, DEFAULT_GROUP, 'DATABASE_URL', 'x')
    setSecret(data, DEFAULT_GROUP, 'API_KEY', 'y')
    addAliases(data, DEFAULT_GROUP, 'API_KEY', ['TOKEN'])

    const { added, conflicts } = addAliases(data, DEFAULT_GROUP, 'DATABASE_URL', [
      'DB_URL',
      'API_KEY',
      'TOKEN',
    ])
    expect(added).toEqual(['DB_URL'])
    expect(conflicts).toEqual([
      { alias: 'API_KEY', owner: 'API_KEY' },
      { alias: 'TOKEN', owner: 'API_KEY' },
    ])
  })

  test('adding an alias twice is a no-op', () => {
    const data = fresh()
    setSecret(data, DEFAULT_GROUP, 'A', '1')
    addAliases(data, DEFAULT_GROUP, 'A', ['B'])
    const { added, conflicts } = addAliases(data, DEFAULT_GROUP, 'A', ['B'])
    expect(added).toEqual([])
    expect(conflicts).toEqual([])
    expect(getSecret(data, DEFAULT_GROUP, 'A')?.aliases).toEqual(['B'])
  })

  test('removeAliases removes and cleans up the field when empty', () => {
    const data = fresh()
    setSecret(data, DEFAULT_GROUP, 'A', '1')
    addAliases(data, DEFAULT_GROUP, 'A', ['B', 'C'])
    expect(removeAliases(data, DEFAULT_GROUP, 'A', ['B'])).toEqual(['B'])
    expect(getSecret(data, DEFAULT_GROUP, 'A')?.aliases).toEqual(['C'])
    expect(removeAliases(data, DEFAULT_GROUP, 'A', ['C'])).toEqual(['C'])
    expect(getSecret(data, DEFAULT_GROUP, 'A')?.aliases).toBeUndefined()
  })

  test('ownerOfName sees direct names and aliases', () => {
    const data = fresh()
    setSecret(data, DEFAULT_GROUP, 'A', '1')
    addAliases(data, DEFAULT_GROUP, 'A', ['B'])
    expect(ownerOfName(data, DEFAULT_GROUP, 'A')).toBe('A')
    expect(ownerOfName(data, DEFAULT_GROUP, 'B')).toBe('A')
    expect(ownerOfName(data, DEFAULT_GROUP, 'C')).toBeUndefined()
  })

  test('setSecret keeps existing aliases unless new ones are given', () => {
    const data = fresh()
    setSecret(data, DEFAULT_GROUP, 'A', '1')
    addAliases(data, DEFAULT_GROUP, 'A', ['B'])
    setSecret(data, DEFAULT_GROUP, 'A', '2')
    expect(getSecret(data, DEFAULT_GROUP, 'A')?.aliases).toEqual(['B'])
    setSecret(data, DEFAULT_GROUP, 'A', '3', undefined, ['C'])
    expect(getSecret(data, DEFAULT_GROUP, 'A')?.aliases).toEqual(['C'])
    setSecret(data, DEFAULT_GROUP, 'A', '4', undefined, [])
    expect(getSecret(data, DEFAULT_GROUP, 'A')?.aliases).toBeUndefined()
  })

  test('mergeAsAlias folds a secret (and its aliases) into another', () => {
    const data = fresh()
    setSecret(data, DEFAULT_GROUP, 'DATABASE_URL', 'postgres://x')
    setSecret(data, DEFAULT_GROUP, 'DB_URL', 'postgres://old')
    addAliases(data, DEFAULT_GROUP, 'DB_URL', ['POSTGRES_URL'])

    const moved = mergeAsAlias(data, DEFAULT_GROUP, 'DB_URL', 'DATABASE_URL')
    expect(moved).toEqual(['DB_URL', 'POSTGRES_URL'])
    expect(getSecret(data, DEFAULT_GROUP, 'DB_URL')).toBeUndefined()
    expect(getSecret(data, DEFAULT_GROUP, 'DATABASE_URL')?.aliases).toEqual([
      'DB_URL',
      'POSTGRES_URL',
    ])
    // Every old name resolves to the target's value now.
    expect(resolveSecret(data, DEFAULT_GROUP, 'DB_URL')?.secret.value).toBe('postgres://x')
    expect(resolveSecret(data, DEFAULT_GROUP, 'POSTGRES_URL')?.name).toBe('DATABASE_URL')
  })

  test('mergeAsAlias resolves the target through an alias and rejects self-moves', () => {
    const data = fresh()
    setSecret(data, DEFAULT_GROUP, 'DATABASE_URL', 'x')
    addAliases(data, DEFAULT_GROUP, 'DATABASE_URL', ['PG_URL'])
    setSecret(data, DEFAULT_GROUP, 'DB_URL', 'y')

    expect(() => mergeAsAlias(data, DEFAULT_GROUP, 'DATABASE_URL', 'PG_URL')).toThrow(
      'onto itself',
    )
    expect(() => mergeAsAlias(data, DEFAULT_GROUP, 'MISSING', 'DATABASE_URL')).toThrow(
      'does not exist',
    )

    mergeAsAlias(data, DEFAULT_GROUP, 'DB_URL', 'PG_URL')
    expect(getSecret(data, DEFAULT_GROUP, 'DATABASE_URL')?.aliases).toEqual(['PG_URL', 'DB_URL'])
  })
})

describe('alias move use case', () => {
  test('planMerge classifies without mutating', async () => {
    const { access, secrets } = testbed
    const vault = await access.initVault('password-123')
    await secrets.saveSecret(vault, DEFAULT_GROUP, {
      name: 'DB_URL',
      value: 'old',
      aliases: ['POSTGRES_URL'],
    })
    await secrets.saveSecret(vault, DEFAULT_GROUP, { name: 'DATABASE_URL', value: 'new' })

    const plan = secrets.planMerge(vault, DEFAULT_GROUP, 'DB_URL', 'DATABASE_URL')
    expect(plan).toEqual({
      target: 'DATABASE_URL',
      valuesDiffer: true,
      aliasesToMove: ['POSTGRES_URL'],
    })
    expect(getSecret(vault.data, DEFAULT_GROUP, 'DB_URL')?.value).toBe('old')

    expect(() => secrets.planMerge(vault, DEFAULT_GROUP, 'POSTGRES_URL', 'DATABASE_URL')).toThrow(
      'is an alias of "DB_URL"',
    )
    expect(() => secrets.planMerge(vault, DEFAULT_GROUP, 'DB_URL', 'MISSING')).toThrow(
      'does not exist',
    )
  })

  test('mergeAsAlias applies and persists', async () => {
    const { access, secrets } = testbed
    const vault = await access.initVault('password-123')
    await secrets.saveSecret(vault, DEFAULT_GROUP, { name: 'DB_URL', value: 'old' })
    await secrets.saveSecret(vault, DEFAULT_GROUP, { name: 'DATABASE_URL', value: 'new' })

    const { target, moved } = await secrets.mergeAsAlias(
      vault,
      DEFAULT_GROUP,
      'DB_URL',
      'DATABASE_URL',
    )
    expect(target).toBe('DATABASE_URL')
    expect(moved).toEqual(['DB_URL'])

    const reopened = await access.openWithPassword('password-123')
    expect(getSecret(reopened.data, DEFAULT_GROUP, 'DB_URL')).toBeUndefined()
    expect(resolveSecret(reopened.data, DEFAULT_GROUP, 'DB_URL')?.secret.value).toBe('new')
  })
})
