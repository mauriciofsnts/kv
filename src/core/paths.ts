import { homedir } from 'node:os'
import { join } from 'node:path'

export function vaultPath(): string {
  if (process.env.KEY_VAULT_PATH) return process.env.KEY_VAULT_PATH
  const configHome = process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config')
  return join(configHome, 'key', 'vault.enc')
}

// Retorna o caminho do cache de sessão e se ele está em tmpfs (XDG_RUNTIME_DIR).
export function sessionPath(): { path: string; volatile: boolean } {
  if (process.env.KEY_SESSION_PATH) {
    return { path: process.env.KEY_SESSION_PATH, volatile: true }
  }
  const runtimeDir = process.env.XDG_RUNTIME_DIR
  if (runtimeDir) return { path: join(runtimeDir, 'key', 'session'), volatile: true }
  return { path: join(homedir(), '.cache', 'key', 'session'), volatile: false }
}
