import { minPasswordLength, vaultLocation } from '../core/paths.ts'
import { storeSessionKey } from '../core/session.ts'
import { createVault, vaultExists } from '../core/vault.ts'
import { hiddenPrompt } from './prompt.ts'

export async function cmdInit(): Promise<void> {
  const location = vaultLocation()
  if (await vaultExists(location)) {
    console.error(`A vault already exists at ${location}.`)
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
  const vault = await createVault(password, location)
  storeSessionKey(vault.key)
  console.log(`Vault created at ${location}.`)
  console.log('Use `key set NAME` to store secrets or `key` to open the TUI.')
}
