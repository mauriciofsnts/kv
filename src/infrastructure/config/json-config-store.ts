// ConfigStore backed by ~/.config/key/config.json plus env overrides.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { ConfigStore } from '../../application/ports.ts'

const DEFAULT_MIN_PASSWORD_LENGTH = 8

function configHome(): string {
  return process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config')
}

export function configPath(): string {
  return join(configHome(), 'key', 'config.json')
}

interface KeyConfig {
  vault?: string
}

function readConfig(): KeyConfig {
  const path = configPath()
  if (!existsSync(path)) return {}
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as KeyConfig
  } catch {
    return {}
  }
}

export const jsonConfigStore: ConfigStore = {
  // Resolution: KEY_VAULT_PATH env > config.json "vault" > default file.
  vaultLocation(): string {
    if (process.env.KEY_VAULT_PATH) return process.env.KEY_VAULT_PATH
    const configured = readConfig().vault
    if (configured) return configured
    return join(configHome(), 'key', 'vault.enc')
  },

  setVaultLocation(location: string): void {
    const path = configPath()
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
    writeFileSync(path, JSON.stringify({ ...readConfig(), vault: location }, null, 2) + '\n', {
      mode: 0o600,
    })
  },

  locationOverridden(): boolean {
    return Boolean(process.env.KEY_VAULT_PATH)
  },

  minPasswordLength(): number {
    const raw = process.env.KEY_MIN_PASSWORD_LENGTH
    const parsed = raw ? Number.parseInt(raw, 10) : DEFAULT_MIN_PASSWORD_LENGTH
    return Number.isFinite(parsed) && parsed >= 1 ? parsed : DEFAULT_MIN_PASSWORD_LENGTH
  },
}
