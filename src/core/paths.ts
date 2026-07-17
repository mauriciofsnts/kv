import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

function configHome(): string {
  return process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config')
}

export function configPath(): string {
  return join(configHome(), 'key', 'config.json')
}

interface KeyConfig {
  vault?: string
}

export function readConfig(): KeyConfig {
  const path = configPath()
  if (!existsSync(path)) return {}
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as KeyConfig
  } catch {
    return {}
  }
}

export function writeConfig(config: KeyConfig): void {
  const path = configPath()
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  writeFileSync(path, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 })
}

// Where the vault lives: a plain file path or a database URL
// (sqlite://, postgres://, mysql://, mariadb://).
// Resolution: KEY_VAULT_PATH env > config.json "vault" > default file.
export function vaultLocation(): string {
  if (process.env.KEY_VAULT_PATH) return process.env.KEY_VAULT_PATH
  const configured = readConfig().vault
  if (configured) return configured
  return join(configHome(), 'key', 'vault.enc')
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
