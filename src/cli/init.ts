import { minPasswordLength, vaultPath } from '../core/paths.ts'
import { storeSessionKey } from '../core/session.ts'
import { createVault, vaultExists } from '../core/vault.ts'
import { hiddenPrompt } from './prompt.ts'

export async function cmdInit(): Promise<void> {
  const path = vaultPath()
  if (vaultExists(path)) {
    console.error(`A vault already exists at ${path}.`)
    process.exit(1)
  }
  const minLength = minPasswordLength()
  const password = await hiddenPrompt('New vault password: ')
  if (password.length < minLength) {
    console.error(`Password must be at least ${minLength} characters (KEY_MIN_PASSWORD_LENGTH).`)
    process.exit(1)
  }
  const confirmation = await hiddenPrompt('Confirm password: ')
  if (password !== confirmation) {
    console.error('Passwords do not match.')
    process.exit(1)
  }
  const vault = createVault(password, path)
  storeSessionKey(vault.key)
  console.log(`Vault created at ${path}.`)
  console.log('Use `key set NAME` to store secrets or `key` to open the TUI.')
}
