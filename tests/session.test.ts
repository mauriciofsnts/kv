import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
})

describe('session', () => {
  test('store + load devolve a mesma chave', () => {
    const key = Buffer.from('a'.repeat(32))
    storeSessionKey(key)
    expect(loadSessionKey()?.equals(key)).toBe(true)
  })

  test('sem sessão devolve null', () => {
    expect(loadSessionKey()).toBeNull()
  })

  test('sessão expirada devolve null e apaga o arquivo', () => {
    process.env.KEY_SESSION_TTL = '1'
    const key = Buffer.from('b'.repeat(32))
    storeSessionKey(key)
    const raw = JSON.parse(readFileSync(process.env.KEY_SESSION_PATH!, 'utf8'))
    raw.expiresAt = Date.now() - 1000
    writeFileSync(process.env.KEY_SESSION_PATH!, JSON.stringify(raw))
    expect(loadSessionKey()).toBeNull()
  })

  test('load renova o TTL', () => {
    const key = Buffer.from('c'.repeat(32))
    storeSessionKey(key)
    const before = JSON.parse(readFileSync(process.env.KEY_SESSION_PATH!, 'utf8')).expiresAt
    Bun.sleepSync(5)
    loadSessionKey()
    const after = JSON.parse(readFileSync(process.env.KEY_SESSION_PATH!, 'utf8')).expiresAt
    expect(after).toBeGreaterThan(before)
  })

  test('clearSession apaga e lock funciona sem sessão', () => {
    storeSessionKey(Buffer.from('d'.repeat(32)))
    clearSession()
    expect(loadSessionKey()).toBeNull()
    clearSession()
  })

  test('arquivo corrompido é tratado como sem sessão', () => {
    writeFileSync(process.env.KEY_SESSION_PATH!, 'não é json')
    expect(loadSessionKey()).toBeNull()
  })
})
