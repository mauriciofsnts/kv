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

// Abre o cofre pela sessão ativa ou pedindo a senha (até 3 tentativas).
export async function unlockVault(): Promise<Vault> {
  const sessionKey = loadSessionKey()
  if (sessionKey) {
    try {
      return openVaultWithKey(sessionKey)
    } catch (err) {
      // Sessão de um cofre antigo (ex: senha trocada): ignora e pede a senha.
      if (!(err instanceof WrongPasswordError)) throw err
    }
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const password = await hiddenPrompt('Senha do cofre: ')
    try {
      const vault = openVaultWithPassword(password)
      const { volatile } = storeSessionKey(vault.key)
      if (!volatile) {
        process.stderr.write(
          'aviso: XDG_RUNTIME_DIR indisponível; sessão em ~/.cache/key/session (disco).\n',
        )
      }
      return vault
    } catch (err) {
      if (err instanceof WrongPasswordError && attempt < MAX_ATTEMPTS) {
        process.stderr.write('Senha incorreta, tente novamente.\n')
        continue
      }
      throw err
    }
  }
  throw new WrongPasswordError()
}

// Grupo: --group > arquivo .key no diretório atual > "default".
export function resolveGroup(flag: string | undefined, cwd = process.cwd()): string {
  if (flag) return flag
  const marker = join(cwd, '.key')
  if (existsSync(marker)) {
    const name = readFileSync(marker, 'utf8').trim()
    if (name) return name
  }
  return DEFAULT_GROUP
}
