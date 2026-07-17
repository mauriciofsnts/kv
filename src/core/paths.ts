import { homedir } from 'node:os'
import { join } from 'node:path'

export function vaultPath(): string {
  if (process.env.KEY_VAULT_PATH) return process.env.KEY_VAULT_PATH
  const configHome = process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config')
  return join(configHome, 'key', 'vault.enc')
}

// Returns the session cache path and whether it lives in tmpfs (XDG_RUNTIME_DIR).
export function sessionPath(): { path: string; volatile: boolean } {
  if (process.env.KEY_SESSION_PATH) {
    return { path: process.env.KEY_SESSION_PATH, volatile: true }
  }
  const runtimeDir = process.env.XDG_RUNTIME_DIR
  if (runtimeDir) return { path: join(runtimeDir, 'key', 'session'), volatile: true }
  return { path: join(homedir(), '.cache', 'key', 'session'), volatile: false }
}

const DEFAULT_MIN_PASSWORD_LENGTH = 8

// Minimum vault password length, admin-configurable via env.
export function minPasswordLength(): number {
  const raw = process.env.KEY_MIN_PASSWORD_LENGTH
  const parsed = raw ? Number.parseInt(raw, 10) : DEFAULT_MIN_PASSWORD_LENGTH
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : DEFAULT_MIN_PASSWORD_LENGTH
}
