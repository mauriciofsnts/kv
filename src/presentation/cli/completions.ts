import { vaultAccess } from '../../composition.ts'
import { listGroups, listSecrets } from '../../domain/secret.ts'
import { resolveGroup } from './unlock.ts'

// `key __complete groups|names` — candidates for the shell completion scripts
// in docs/completions/. Only ever uses the active session: completion must
// never prompt for a password or print errors, so on a locked/missing vault
// it stays silent.
export async function cmdComplete(what: string | undefined, groupFlag?: string): Promise<void> {
  try {
    const vault = await vaultAccess.openWithSession()
    if (!vault) return
    if (what === 'groups') {
      for (const group of listGroups(vault.data)) console.log(group)
    } else if (what === 'names') {
      const group = resolveGroup(groupFlag)
      for (const [name, secret] of listSecrets(vault.data, group)) {
        console.log(name)
        for (const alias of secret.aliases ?? []) console.log(alias)
      }
    }
  } catch {
    // Silent by design: a broken completion helper must not break the shell.
  }
}
