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

const MARKER_FILES = ['.kv', '.key']

// Group resolution: --group > .kv file in the current directory (.key still
// honored from when the tool was named `key`) > "default".
export function resolveGroup(flag: string | undefined, cwd = process.cwd()): string {
  if (flag) return flag
  for (const file of MARKER_FILES) {
    const marker = join(cwd, file)
    if (existsSync(marker)) {
      const name = readFileSync(marker, 'utf8').trim()
      if (name) return name
    }
  }
  return DEFAULT_GROUP
}

// Path of the group marker for `kv use`: the existing .kv/.key file if the
// directory already has one (so re-pinning doesn't leave a second, stale
// marker behind), else a new .kv file.
export function groupMarkerPath(cwd = process.cwd()): string {
  for (const file of MARKER_FILES) {
    const marker = join(cwd, file)
    if (existsSync(marker)) return marker
  }
  return join(cwd, '.kv')
}

// `resolveGroup` never fails: an unknown group is only caught once a command
// actually looks it up in the vault. When that happens, callers use this to
// check and report — and, since "default" always exists, an unresolvable
// group with no --group flag can only mean a stale/mistyped .kv marker, so
// the message points at it and at the fix (`kv use`) instead of just "no
// such group".
export function requireGroup(vault: Vault, group: string, flag: string | undefined): void {
  if (group in vault.data.groups) return
  let hint = ''
  if (!flag) {
    const marker = groupMarkerPath()
    if (existsSync(marker)) hint = ` ${uiErr.dim(`(pinned in ${marker} — fix with \`kv use <group>\`)`)}`
  }
  console.error(uiErr.bad(`Group "${group}" does not exist in the vault.`) + hint)
  process.exit(1)
}
