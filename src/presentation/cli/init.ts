import { config, vaultAccess } from '../../composition.ts'
import { hiddenPrompt } from './prompt.ts'

export async function cmdInit(): Promise<void> {
  const location = config.vaultLocation()
  if (await vaultAccess.exists(location)) {
    console.error(`A vault already exists at ${location}.`)
    process.exit(1)
  }
  const password = await hiddenPrompt('New vault password: ')
  if (password.length < config.minPasswordLength()) {
    console.error(
      `Password must be at least ${config.minPasswordLength()} characters (KEY_MIN_PASSWORD_LENGTH).`,
    )
    process.exit(1)
  }
  const confirmation = await hiddenPrompt('Confirm password: ')
  if (password !== confirmation) {
    console.error('Passwords do not match.')
    process.exit(1)
  }
  await vaultAccess.initVault(password, location)
  console.log(`Vault created at ${location}.`)
  console.log('Use `key set NAME` to store secrets or `key` to open the TUI.')
}
