// SessionCache backed by a file holding the derived key (never the
// password) with an expiry, renewed on each use. Lives in tmpfs
// (XDG_RUNTIME_DIR) when available so it vanishes on reboot.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { SessionCache } from '../../application/ports.ts'

const DEFAULT_TTL_SECONDS = 15 * 60

export function sessionTtlMs(): number {
  const raw = process.env.KV_SESSION_TTL
  const seconds = raw ? Number.parseInt(raw, 10) : DEFAULT_TTL_SECONDS
  return (Number.isFinite(seconds) && seconds > 0 ? seconds : DEFAULT_TTL_SECONDS) * 1000
}

// Returns the session cache path and whether it lives in tmpfs.
export function sessionPath(): { path: string; volatile: boolean } {
  if (process.env.KV_SESSION_PATH) {
    return { path: process.env.KV_SESSION_PATH, volatile: true }
  }
  const runtimeDir = process.env.XDG_RUNTIME_DIR
  if (runtimeDir) return { path: join(runtimeDir, 'kv', 'session'), volatile: true }
  return { path: join(homedir(), '.cache', 'kv', 'session'), volatile: false }
}

interface SessionFile {
  key: string
  expiresAt: number
}

export const fileSessionCache: SessionCache = {
  store(key: Buffer): { volatile: boolean } {
    const { path, volatile } = sessionPath()
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
    const session: SessionFile = {
      key: key.toString('base64'),
      expiresAt: Date.now() + sessionTtlMs(),
    }
    writeFileSync(path, JSON.stringify(session), { mode: 0o600 })
    return { volatile }
  },

  load(): Buffer | null {
    const { path } = sessionPath()
    if (!existsSync(path)) return null
    try {
      const session = JSON.parse(readFileSync(path, 'utf8')) as SessionFile
      if (Date.now() >= session.expiresAt) {
        this.clear()
        return null
      }
      const key = Buffer.from(session.key, 'base64')
      this.store(key)
      return key
    } catch {
      this.clear()
      return null
    }
  },

  clear(): void {
    rmSync(sessionPath().path, { force: true })
  },
}
