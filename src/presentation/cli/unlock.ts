import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Vault } from '../../application/vault.ts'
import { vaultAccess } from '../../composition.ts'
import { DEFAULT_GROUP } from '../../domain/secret.ts'
import { WrongPasswordError } from '../../domain/errors.ts'
import { hiddenPrompt } from './prompt.ts'
import { statusLine, uiErr } from './ui.ts'

const MAX_ATTEMPTS = 3

// Opens the vault via the active session or by asking for the password
// (up to 3 attempts).
export async function unlockVault(): Promise<Vault> {
  try {
    const fromSession = await vaultAccess.openWithSession()
    if (fromSession) return fromSession
  } catch (err) {
    // Session from an older vault (e.g. password changed): ignore and ask.
    if (!(err instanceof WrongPasswordError)) throw err
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const password = await hiddenPrompt('Vault password: ')
    const done = statusLine('unlocking vault…')
    try {
      const vault = await vaultAccess.openWithPassword(password)
      done()
      const { volatile } = vaultAccess.startSession(vault)
      if (!volatile) {
        process.stderr.write(
          uiErr.yellow('warning:') +
            ' XDG_RUNTIME_DIR unavailable; session stored at ~/.cache/kv/session (disk).\n',
        )
      }
      return vault
    } catch (err) {
      done()
      if (err instanceof WrongPasswordError && attempt < MAX_ATTEMPTS) {
        process.stderr.write(uiErr.red('Wrong password') + ', try again.\n')
        continue
      }
      throw err
    }
  }
  throw new WrongPasswordError()
}

// Group resolution: --group > .kv file in the current directory (.key still
// honored from when the tool was named `key`) > "default".
export function resolveGroup(flag: string | undefined, cwd = process.cwd()): string {
  if (flag) return flag
  for (const file of ['.kv', '.key']) {
    const marker = join(cwd, file)
    if (existsSync(marker)) {
      const name = readFileSync(marker, 'utf8').trim()
      if (name) return name
    }
  }
  return DEFAULT_GROUP
}
