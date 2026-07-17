import { config, relocateVault } from '../../composition.ts'
import { confirmPrompt } from './prompt.ts'

// key vault             → show the current vault location and backend
// key vault <location>  → point the vault at a file path or database URL,
//                         offering to copy the existing (encrypted) envelope.
export async function cmdVault(location: string | undefined): Promise<void> {
  if (!location) {
    const status = await relocateVault.status()
    console.log(`location: ${status.location}`)
    console.log(`backend:  ${status.kind}`)
    console.log(`status:   ${status.exists ? 'vault found' : 'no vault yet (run `key init`)'}`)
    if (status.overridden) {
      console.log('note:     set via KEY_VAULT_PATH (overrides config.json)')
    }
    return
  }

  if (config.locationOverridden()) {
    console.error('KEY_VAULT_PATH is set and would override this change. Unset it first.')
    process.exit(1)
  }
  const target = await relocateVault.inspectTarget(location)
  if (target.sameLocation) {
    console.log(`The vault already lives at ${location}.`)
    return
  }

  // The envelope is ciphertext, so moving it needs no password.
  if (target.currentExists && !target.targetExists) {
    if (await confirmPrompt(`Copy the existing vault from ${target.currentLocation} to ${location}?`)) {
      await relocateVault.copyVault(location)
      console.log('✓ Vault copied (the original stays in place; remove it manually if you want).')
    }
  } else if (target.targetExists) {
    console.log(`A vault already exists at ${location}; switching without copying.`)
  }

  relocateVault.setLocation(location)
  console.log(`✓ Vault location set to ${location} (${target.targetKind}).`)
}
