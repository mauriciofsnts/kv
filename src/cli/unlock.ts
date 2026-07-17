import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { WrongPasswordError } from '../core/crypto.ts'
import { loadSessionKey, storeSessionKey } from '../core/session.ts'
import {
  DEFAULT_GROUP,
  type Vault,
  openVaultWithKey,
  openVaultWithPassword,
} from '../core/vault.ts'
import { hiddenPrompt } from './prompt.ts'

const MAX_ATTEMPTS = 3

// Opens the vault via the active session or by asking for the password
// (up to 3 attempts).
export async function unlockVault(): Promise<Vault> {
  const sessionKey = loadSessionKey()
  if (sessionKey) {
    try {
      return openVaultWithKey(sessionKey)
    } catch (err) {
      // Session from an older vault (e.g. password changed): ignore and ask.
      if (!(err instanceof WrongPasswordError)) throw err
    }
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const password = await hiddenPrompt('Vault password: ')
    try {
      const vault = openVaultWithPassword(password)
      const { volatile } = storeSessionKey(vault.key)
      if (!volatile) {
        process.stderr.write(
          'warning: XDG_RUNTIME_DIR unavailable; session stored at ~/.cache/key/session (disk).\n',
        )
      }
      return vault
    } catch (err) {
      if (err instanceof WrongPasswordError && attempt < MAX_ATTEMPTS) {
        process.stderr.write('Wrong password, try again.\n')
        continue
      }
      throw err
    }
  }
  throw new WrongPasswordError()
}

// Group resolution: --group > .key file in the current directory > "default".
export function resolveGroup(flag: string | undefined, cwd = process.cwd()): string {
  if (flag) return flag
  const marker = join(cwd, '.key')
  if (existsSync(marker)) {
    const name = readFileSync(marker, 'utf8').trim()
    if (name) return name
  }
  return DEFAULT_GROUP
}
