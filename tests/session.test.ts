import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { jsonConfigStore } from '../src/infrastructure/config/json-config-store.ts'
import { fileSessionCache } from '../src/infrastructure/session/file-session-cache.ts'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'key-session-'))
  process.env.KEY_SESSION_PATH = join(dir, 'session')
  process.env.XDG_CONFIG_HOME = join(dir, 'config')
  delete process.env.KEY_SESSION_TTL
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  delete process.env.KEY_SESSION_PATH
  delete process.env.KEY_SESSION_TTL
  delete process.env.KEY_MIN_PASSWORD_LENGTH
  delete process.env.KEY_FORCE_APPLY
  delete process.env.XDG_CONFIG_HOME
})

describe('session', () => {
  test('store + load returns the same key', () => {
    const key = Buffer.from('a'.repeat(32))
    fileSessionCache.store(key)
    expect(fileSessionCache.load()?.equals(key)).toBe(true)
  })

  test('no session returns null', () => {
    expect(fileSessionCache.load()).toBeNull()
  })

  test('expired session returns null and deletes the file', () => {
    process.env.KEY_SESSION_TTL = '1'
    const key = Buffer.from('b'.repeat(32))
    fileSessionCache.store(key)
    const raw = JSON.parse(readFileSync(process.env.KEY_SESSION_PATH!, 'utf8'))
    raw.expiresAt = Date.now() - 1000
    writeFileSync(process.env.KEY_SESSION_PATH!, JSON.stringify(raw))
    expect(fileSessionCache.load()).toBeNull()
  })

  test('load renews the TTL', () => {
    const key = Buffer.from('c'.repeat(32))
    fileSessionCache.store(key)
    const before = JSON.parse(readFileSync(process.env.KEY_SESSION_PATH!, 'utf8')).expiresAt
    Bun.sleepSync(5)
    fileSessionCache.load()
    const after = JSON.parse(readFileSync(process.env.KEY_SESSION_PATH!, 'utf8')).expiresAt
    expect(after).toBeGreaterThan(before)
  })

  test('clearSession deletes and locking twice is safe', () => {
    fileSessionCache.store(Buffer.from('d'.repeat(32)))
    fileSessionCache.clear()
    expect(fileSessionCache.load()).toBeNull()
    fileSessionCache.clear()
  })

  test('corrupted file is treated as no session', () => {
    writeFileSync(process.env.KEY_SESSION_PATH!, 'not json')
    expect(fileSessionCache.load()).toBeNull()
  })
})

describe('minPasswordLength', () => {
  test('defaults to 8', () => {
    expect(jsonConfigStore.minPasswordLength()).toBe(8)
  })

  test('reads KEY_MIN_PASSWORD_LENGTH', () => {
    process.env.KEY_MIN_PASSWORD_LENGTH = '12'
    expect(jsonConfigStore.minPasswordLength()).toBe(12)
    process.env.KEY_MIN_PASSWORD_LENGTH = '1'
    expect(jsonConfigStore.minPasswordLength()).toBe(1)
  })

  test('falls back to 8 on invalid values', () => {
    process.env.KEY_MIN_PASSWORD_LENGTH = 'abc'
    expect(jsonConfigStore.minPasswordLength()).toBe(8)
    process.env.KEY_MIN_PASSWORD_LENGTH = '0'
    expect(jsonConfigStore.minPasswordLength()).toBe(8)
    process.env.KEY_MIN_PASSWORD_LENGTH = '-5'
    expect(jsonConfigStore.minPasswordLength()).toBe(8)
  })
})

describe('forceApply', () => {
  test('defaults to off', () => {
    expect(jsonConfigStore.forceApply()).toBe(false)
  })

  test('setForceApply persists across reads', () => {
    jsonConfigStore.setForceApply(true)
    expect(jsonConfigStore.forceApply()).toBe(true)
    jsonConfigStore.setForceApply(false)
    expect(jsonConfigStore.forceApply()).toBe(false)
  })

  test('setForceApply keeps the vault location intact', () => {
    jsonConfigStore.setVaultLocation('/tmp/some-vault.enc')
    jsonConfigStore.setForceApply(true)
    delete process.env.KEY_VAULT_PATH
    expect(jsonConfigStore.vaultLocation()).toBe('/tmp/some-vault.enc')
    expect(jsonConfigStore.forceApply()).toBe(true)
  })

  test('KEY_FORCE_APPLY overrides the persisted value', () => {
    jsonConfigStore.setForceApply(true)
    process.env.KEY_FORCE_APPLY = '0'
    expect(jsonConfigStore.forceApply()).toBe(false)
    process.env.KEY_FORCE_APPLY = 'false'
    expect(jsonConfigStore.forceApply()).toBe(false)
    jsonConfigStore.setForceApply(false)
    process.env.KEY_FORCE_APPLY = '1'
    expect(jsonConfigStore.forceApply()).toBe(true)
    process.env.KEY_FORCE_APPLY = 'true'
    expect(jsonConfigStore.forceApply()).toBe(true)
  })

  test('unrecognized KEY_FORCE_APPLY falls back to config', () => {
    process.env.KEY_FORCE_APPLY = 'maybe'
    expect(jsonConfigStore.forceApply()).toBe(false)
    jsonConfigStore.setForceApply(true)
    expect(jsonConfigStore.forceApply()).toBe(true)
  })
})
