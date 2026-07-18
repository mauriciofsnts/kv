// ConfigStore backed by ~/.config/kv/config.json plus env overrides.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { ConfigStore } from '../../application/ports.ts'

const DEFAULT_MIN_PASSWORD_LENGTH = 8

function configHome(): string {
  return process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config')
}

export function configPath(): string {
  return join(configHome(), 'kv', 'config.json')
}

interface KeyConfig {
  vault?: string
  forceApply?: boolean
}

function writeConfig(config: KeyConfig): void {
  const path = configPath()
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  writeFileSync(path, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 })
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
  // Resolution: KV_VAULT_PATH env > config.json "vault" > default file.
  vaultLocation(): string {
    if (process.env.KV_VAULT_PATH) return process.env.KV_VAULT_PATH
    const configured = readConfig().vault
    if (configured) return configured
    return join(configHome(), 'kv', 'vault.enc')
  },

  setVaultLocation(location: string): void {
    writeConfig({ ...readConfig(), vault: location })
  },

  locationOverridden(): boolean {
    return Boolean(process.env.KV_VAULT_PATH)
  },

  // Resolution: KV_FORCE_APPLY env ("1"/"true"/"0"/"false") > config.json
  // "forceApply" > off.
  forceApply(): boolean {
    const raw = process.env.KV_FORCE_APPLY?.toLowerCase()
    if (raw === '1' || raw === 'true') return true
    if (raw === '0' || raw === 'false') return false
    return readConfig().forceApply === true
  },

  setForceApply(value: boolean): void {
    writeConfig({ ...readConfig(), forceApply: value })
  },

  minPasswordLength(): number {
    const raw = process.env.KV_MIN_PASSWORD_LENGTH
    const parsed = raw ? Number.parseInt(raw, 10) : DEFAULT_MIN_PASSWORD_LENGTH
    return Number.isFinite(parsed) && parsed >= 1 ? parsed : DEFAULT_MIN_PASSWORD_LENGTH
  },
}
