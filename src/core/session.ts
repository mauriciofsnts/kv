import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { sessionPath } from './paths.ts'

const DEFAULT_TTL_SECONDS = 15 * 60

export function sessionTtlMs(): number {
  const raw = process.env.KEY_SESSION_TTL
  const seconds = raw ? Number.parseInt(raw, 10) : DEFAULT_TTL_SECONDS
  return (Number.isFinite(seconds) && seconds > 0 ? seconds : DEFAULT_TTL_SECONDS) * 1000
}

interface SessionFile {
  key: string
  expiresAt: number
}

// Grava a chave derivada (nunca a senha) com validade. Renovada a cada uso.
export function storeSessionKey(key: Buffer): { volatile: boolean } {
  const { path, volatile } = sessionPath()
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  const session: SessionFile = {
    key: key.toString('base64'),
    expiresAt: Date.now() + sessionTtlMs(),
  }
  writeFileSync(path, JSON.stringify(session), { mode: 0o600 })
  return { volatile }
}

export function loadSessionKey(): Buffer | null {
  const { path } = sessionPath()
  if (!existsSync(path)) return null
  try {
    const session = JSON.parse(readFileSync(path, 'utf8')) as SessionFile
    if (Date.now() >= session.expiresAt) {
      clearSession()
      return null
    }
    const key = Buffer.from(session.key, 'base64')
    storeSessionKey(key)
    return key
  } catch {
    clearSession()
    return null
  }
}

export function clearSession(): void {
  const { path } = sessionPath()
  rmSync(path, { force: true })
}
