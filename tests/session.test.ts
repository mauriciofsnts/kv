import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { minPasswordLength } from '../src/core/paths.ts'
import { clearSession, loadSessionKey, storeSessionKey } from '../src/core/session.ts'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'key-session-'))
  process.env.KEY_SESSION_PATH = join(dir, 'session')
  delete process.env.KEY_SESSION_TTL
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  delete process.env.KEY_SESSION_PATH
  delete process.env.KEY_SESSION_TTL
  delete process.env.KEY_MIN_PASSWORD_LENGTH
})

describe('session', () => {
  test('store + load returns the same key', () => {
    const key = Buffer.from('a'.repeat(32))
    storeSessionKey(key)
    expect(loadSessionKey()?.equals(key)).toBe(true)
  })

  test('no session returns null', () => {
    expect(loadSessionKey()).toBeNull()
  })

  test('expired session returns null and deletes the file', () => {
    process.env.KEY_SESSION_TTL = '1'
    const key = Buffer.from('b'.repeat(32))
    storeSessionKey(key)
    const raw = JSON.parse(readFileSync(process.env.KEY_SESSION_PATH!, 'utf8'))
    raw.expiresAt = Date.now() - 1000
    writeFileSync(process.env.KEY_SESSION_PATH!, JSON.stringify(raw))
    expect(loadSessionKey()).toBeNull()
  })

  test('load renews the TTL', () => {
    const key = Buffer.from('c'.repeat(32))
    storeSessionKey(key)
    const before = JSON.parse(readFileSync(process.env.KEY_SESSION_PATH!, 'utf8')).expiresAt
    Bun.sleepSync(5)
    loadSessionKey()
    const after = JSON.parse(readFileSync(process.env.KEY_SESSION_PATH!, 'utf8')).expiresAt
    expect(after).toBeGreaterThan(before)
  })

  test('clearSession deletes and locking twice is safe', () => {
    storeSessionKey(Buffer.from('d'.repeat(32)))
    clearSession()
    expect(loadSessionKey()).toBeNull()
    clearSession()
  })

  test('corrupted file is treated as no session', () => {
    writeFileSync(process.env.KEY_SESSION_PATH!, 'not json')
    expect(loadSessionKey()).toBeNull()
  })
})

describe('minPasswordLength', () => {
  test('defaults to 8', () => {
    expect(minPasswordLength()).toBe(8)
  })

  test('reads KEY_MIN_PASSWORD_LENGTH', () => {
    process.env.KEY_MIN_PASSWORD_LENGTH = '12'
    expect(minPasswordLength()).toBe(12)
    process.env.KEY_MIN_PASSWORD_LENGTH = '1'
    expect(minPasswordLength()).toBe(1)
  })

  test('falls back to 8 on invalid values', () => {
    process.env.KEY_MIN_PASSWORD_LENGTH = 'abc'
    expect(minPasswordLength()).toBe(8)
    process.env.KEY_MIN_PASSWORD_LENGTH = '0'
    expect(minPasswordLength()).toBe(8)
    process.env.KEY_MIN_PASSWORD_LENGTH = '-5'
    expect(minPasswordLength()).toBe(8)
  })
})
