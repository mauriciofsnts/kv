import { readConfig, vaultLocation, writeConfig } from '../core/paths.ts'
import { storageFor } from '../core/storage.ts'
import { confirmPrompt } from './prompt.ts'

// key vault             → show the current vault location and backend
// key vault <location>  → point the vault at a file path or database URL,
//                         offering to copy the existing (encrypted) envelope.
export async function cmdVault(location: string | undefined): Promise<void> {
  const current = vaultLocation()
  const currentStorage = storageFor(current)

  if (!location) {
    const exists = await currentStorage.exists()
    console.log(`location: ${current}`)
    console.log(`backend:  ${currentStorage.kind}`)
    console.log(`status:   ${exists ? 'vault found' : 'no vault yet (run `key init`)'}`)
    if (process.env.KEY_VAULT_PATH) {
      console.log('note:     set via KEY_VAULT_PATH (overrides config.json)')
    }
    return
  }

  if (process.env.KEY_VAULT_PATH) {
    console.error('KEY_VAULT_PATH is set and would override this change. Unset it first.')
    process.exit(1)
  }
  if (location === current) {
    console.log(`The vault already lives at ${location}.`)
    return
  }

  const target = storageFor(location)
  // The envelope is ciphertext, so moving it needs no password.
  if ((await currentStorage.exists()) && !(await target.exists())) {
    if (await confirmPrompt(`Copy the existing vault from ${current} to ${location}?`)) {
      await target.write(await currentStorage.read())
      console.log('✓ Vault copied (the original stays in place; remove it manually if you want).')
    }
  } else if (await target.exists()) {
    console.log(`A vault already exists at ${location}; switching without copying.`)
  }

  writeConfig({ ...readConfig(), vault: location })
  console.log(`✓ Vault location set to ${location} (${target.kind}).`)
}
