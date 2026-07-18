import { config, relocateVault } from '../../composition.ts'
import { confirmPrompt } from './prompt.ts'
import { ui, uiErr } from './ui.ts'

// key vault             → show the current vault location and backend
// key vault <location>  → point the vault at a file path or database URL,
//                         offering to copy the existing (encrypted) envelope.
export async function cmdVault(location: string | undefined): Promise<void> {
  if (!location) {
    const status = await relocateVault.status()
    console.log(`${ui.dim('location:')} ${ui.bold(status.location)}`)
    console.log(`${ui.dim('backend:')}  ${status.kind}`)
    console.log(
      `${ui.dim('status:')}   ${status.exists ? ui.green('vault found') : ui.yellow('no vault yet') + ui.dim(' (run `key init`)')}`,
    )
    if (status.overridden) {
      console.log(ui.dim('note:     set via KEY_VAULT_PATH (overrides config.json)'))
    }
    return
  }

  if (config.locationOverridden()) {
    console.error(uiErr.bad('KEY_VAULT_PATH is set and would override this change. Unset it first.'))
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
      console.log(ui.ok('Vault copied ') + ui.dim('(the original stays in place; remove it manually if you want).'))
    }
  } else if (target.targetExists) {
    console.log(`A vault already exists at ${location}; switching without copying.`)
  }

  relocateVault.setLocation(location)
  console.log(ui.ok(`Vault location set to ${ui.bold(location)} ${ui.dim(`(${target.targetKind})`)}.`))
}
