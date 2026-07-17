import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WrongPasswordError } from '../src/core/crypto.ts'
import {
  DEFAULT_GROUP,
  VaultExistsError,
  VaultNotFoundError,
  createVault,
  getSecret,
  listGroups,
  listSecrets,
  openVaultWithKey,
  openVaultWithPassword,
  rekeyVault,
  removeGroup,
  removeSecret,
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
  test('create + reopen com senha', () => {
    const vault = createVault('senha', path)
    setSecret(vault, DEFAULT_GROUP, 'POSTGRES_DB', 'meudb')
    saveVault(vault)

    const reopened = openVaultWithPassword('senha', path)
    expect(getSecret(reopened, DEFAULT_GROUP, 'POSTGRES_DB')?.value).toBe('meudb')
  })

  test('senha errada lança WrongPasswordError', () => {
    createVault('senha', path)
    expect(() => openVaultWithPassword('errada', path)).toThrow(WrongPasswordError)
  })

  test('abrir com chave derivada (sessão)', () => {
    const vault = createVault('senha', path)
    setSecret(vault, DEFAULT_GROUP, 'X', '1')
    saveVault(vault)
    const reopened = openVaultWithKey(vault.key, path)
    expect(getSecret(reopened, DEFAULT_GROUP, 'X')?.value).toBe('1')
  })

  test('não sobrescreve cofre existente', () => {
    createVault('senha', path)
    expect(() => createVault('outra', path)).toThrow(VaultExistsError)
  })

  test('cofre inexistente', () => {
    expect(() => openVaultWithPassword('senha', path)).toThrow(VaultNotFoundError)
  })

  test('save mantém backup .bak da versão anterior', () => {
    const vault = createVault('senha', path)
    setSecret(vault, DEFAULT_GROUP, 'A', '1')
    saveVault(vault)
    expect(existsSync(path + '.bak')).toBe(true)
    expect(existsSync(path + '.tmp')).toBe(false)
  })

  test('rekey troca a senha e invalida a antiga', () => {
    const vault = createVault('antiga', path)
    setSecret(vault, DEFAULT_GROUP, 'A', '1')
    saveVault(vault)
    rekeyVault(vault, 'nova')

    expect(() => openVaultWithPassword('antiga', path)).toThrow(WrongPasswordError)
    expect(getSecret(openVaultWithPassword('nova', path), DEFAULT_GROUP, 'A')?.value).toBe('1')
  })

  test('grupos: set cria grupo, list ordena, remove protege default', () => {
    const vault = createVault('senha', path)
    setSecret(vault, 'projeto-b', 'K', 'v')
    setSecret(vault, 'projeto-a', 'K', 'v')
    expect(listGroups(vault)).toEqual([DEFAULT_GROUP, 'projeto-a', 'projeto-b'])
    expect(removeGroup(vault, 'projeto-b')).toBe(true)
    expect(removeGroup(vault, DEFAULT_GROUP)).toBe(false)
  })

  test('remove secret e lista ordenada', () => {
    const vault = createVault('senha', path)
    setSecret(vault, DEFAULT_GROUP, 'B_VAR', '2')
    setSecret(vault, DEFAULT_GROUP, 'A_VAR', '1')
    expect(listSecrets(vault, DEFAULT_GROUP).map(([n]) => n)).toEqual(['A_VAR', 'B_VAR'])
    expect(removeSecret(vault, DEFAULT_GROUP, 'A_VAR')).toBe(true)
    expect(removeSecret(vault, DEFAULT_GROUP, 'NAO_EXISTE')).toBe(false)
  })
})
