import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WrongPasswordError } from '../src/core/crypto.ts'
import {
  DEFAULT_GROUP,
  VaultExistsError,
  VaultNotFoundError,
  addAliases,
  createVault,
  getSecret,
  listGroups,
  listSecrets,
  openVaultWithKey,
  openVaultWithPassword,
  ownerOfName,
  rekeyVault,
  removeAliases,
  removeGroup,
  removeSecret,
  resolveSecret,
  saveVault,
  setSecret,
} from '../src/core/vault.ts'

let dir: string
let path: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'key-vault-'))
  path = join(dir, 'vault.enc')
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('vault', () => {
  test('create + reopen with password', () => {
    const vault = createVault('password', path)
    setSecret(vault, DEFAULT_GROUP, 'POSTGRES_DB', 'mydb')
    saveVault(vault)

    const reopened = openVaultWithPassword('password', path)
    expect(getSecret(reopened, DEFAULT_GROUP, 'POSTGRES_DB')?.value).toBe('mydb')
  })

  test('wrong password throws WrongPasswordError', () => {
    createVault('password', path)
    expect(() => openVaultWithPassword('wrong', path)).toThrow(WrongPasswordError)
  })

  test('open with derived key (session)', () => {
    const vault = createVault('password', path)
    setSecret(vault, DEFAULT_GROUP, 'X', '1')
    saveVault(vault)
    const reopened = openVaultWithKey(vault.key, path)
    expect(getSecret(reopened, DEFAULT_GROUP, 'X')?.value).toBe('1')
  })

  test('does not overwrite an existing vault', () => {
    createVault('password', path)
    expect(() => createVault('other', path)).toThrow(VaultExistsError)
  })

  test('missing vault', () => {
    expect(() => openVaultWithPassword('password', path)).toThrow(VaultNotFoundError)
  })

  test('save keeps a .bak backup of the previous version', () => {
    const vault = createVault('password', path)
    setSecret(vault, DEFAULT_GROUP, 'A', '1')
    saveVault(vault)
    expect(existsSync(path + '.bak')).toBe(true)
    expect(existsSync(path + '.tmp')).toBe(false)
  })

  test('rekey changes the password and invalidates the old one', () => {
    const vault = createVault('old-pass', path)
    setSecret(vault, DEFAULT_GROUP, 'A', '1')
    saveVault(vault)
    rekeyVault(vault, 'new-pass')

    expect(() => openVaultWithPassword('old-pass', path)).toThrow(WrongPasswordError)
    expect(getSecret(openVaultWithPassword('new-pass', path), DEFAULT_GROUP, 'A')?.value).toBe('1')
  })

  test('groups: set creates group, list sorts, remove protects default', () => {
    const vault = createVault('password', path)
    setSecret(vault, 'project-b', 'K', 'v')
    setSecret(vault, 'project-a', 'K', 'v')
    expect(listGroups(vault)).toEqual([DEFAULT_GROUP, 'project-a', 'project-b'])
    expect(removeGroup(vault, 'project-b')).toBe(true)
    expect(removeGroup(vault, DEFAULT_GROUP)).toBe(false)
  })

  test('remove secret and sorted listing', () => {
    const vault = createVault('password', path)
    setSecret(vault, DEFAULT_GROUP, 'B_VAR', '2')
    setSecret(vault, DEFAULT_GROUP, 'A_VAR', '1')
    expect(listSecrets(vault, DEFAULT_GROUP).map(([n]) => n)).toEqual(['A_VAR', 'B_VAR'])
    expect(removeSecret(vault, DEFAULT_GROUP, 'A_VAR')).toBe(true)
    expect(removeSecret(vault, DEFAULT_GROUP, 'MISSING')).toBe(false)
  })
})

describe('aliases', () => {
  test('resolveSecret matches canonical name and aliases', () => {
    const vault = createVault('password', path)
    setSecret(vault, DEFAULT_GROUP, 'DATABASE_URL', 'postgres://x')
    addAliases(vault, DEFAULT_GROUP, 'DATABASE_URL', ['DB_URL', 'POSTGRES_URL'])

    expect(resolveSecret(vault, DEFAULT_GROUP, 'DATABASE_URL')?.secret.value).toBe('postgres://x')
    expect(resolveSecret(vault, DEFAULT_GROUP, 'DB_URL')?.name).toBe('DATABASE_URL')
    expect(resolveSecret(vault, DEFAULT_GROUP, 'POSTGRES_URL')?.secret.value).toBe('postgres://x')
    expect(resolveSecret(vault, DEFAULT_GROUP, 'NOPE')).toBeUndefined()
  })

  test('aliases survive save/reopen', () => {
    const vault = createVault('password', path)
    setSecret(vault, DEFAULT_GROUP, 'DATABASE_URL', 'postgres://x')
    addAliases(vault, DEFAULT_GROUP, 'DATABASE_URL', ['DB_URL'])
    saveVault(vault)
    const reopened = openVaultWithPassword('password', path)
    expect(resolveSecret(reopened, DEFAULT_GROUP, 'DB_URL')?.name).toBe('DATABASE_URL')
  })

  test('addAliases reports conflicts with existing names and aliases', () => {
    const vault = createVault('password', path)
    setSecret(vault, DEFAULT_GROUP, 'DATABASE_URL', 'x')
    setSecret(vault, DEFAULT_GROUP, 'API_KEY', 'y')
    addAliases(vault, DEFAULT_GROUP, 'API_KEY', ['TOKEN'])

    const { added, conflicts } = addAliases(vault, DEFAULT_GROUP, 'DATABASE_URL', [
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
    const vault = createVault('password', path)
    setSecret(vault, DEFAULT_GROUP, 'A', '1')
    addAliases(vault, DEFAULT_GROUP, 'A', ['B'])
    const { added, conflicts } = addAliases(vault, DEFAULT_GROUP, 'A', ['B'])
    expect(added).toEqual([])
    expect(conflicts).toEqual([])
    expect(getSecret(vault, DEFAULT_GROUP, 'A')?.aliases).toEqual(['B'])
  })

  test('removeAliases removes and cleans up the field when empty', () => {
    const vault = createVault('password', path)
    setSecret(vault, DEFAULT_GROUP, 'A', '1')
    addAliases(vault, DEFAULT_GROUP, 'A', ['B', 'C'])
    expect(removeAliases(vault, DEFAULT_GROUP, 'A', ['B'])).toEqual(['B'])
    expect(getSecret(vault, DEFAULT_GROUP, 'A')?.aliases).toEqual(['C'])
    expect(removeAliases(vault, DEFAULT_GROUP, 'A', ['C'])).toEqual(['C'])
    expect(getSecret(vault, DEFAULT_GROUP, 'A')?.aliases).toBeUndefined()
  })

  test('ownerOfName sees direct names and aliases', () => {
    const vault = createVault('password', path)
    setSecret(vault, DEFAULT_GROUP, 'A', '1')
    addAliases(vault, DEFAULT_GROUP, 'A', ['B'])
    expect(ownerOfName(vault, DEFAULT_GROUP, 'A')).toBe('A')
    expect(ownerOfName(vault, DEFAULT_GROUP, 'B')).toBe('A')
    expect(ownerOfName(vault, DEFAULT_GROUP, 'C')).toBeUndefined()
  })

  test('setSecret keeps existing aliases unless new ones are given', () => {
    const vault = createVault('password', path)
    setSecret(vault, DEFAULT_GROUP, 'A', '1')
    addAliases(vault, DEFAULT_GROUP, 'A', ['B'])
    setSecret(vault, DEFAULT_GROUP, 'A', '2')
    expect(getSecret(vault, DEFAULT_GROUP, 'A')?.aliases).toEqual(['B'])
    setSecret(vault, DEFAULT_GROUP, 'A', '3', undefined, ['C'])
    expect(getSecret(vault, DEFAULT_GROUP, 'A')?.aliases).toEqual(['C'])
    setSecret(vault, DEFAULT_GROUP, 'A', '4', undefined, [])
    expect(getSecret(vault, DEFAULT_GROUP, 'A')?.aliases).toBeUndefined()
  })
})
