import { existsSync, writeFileSync } from 'node:fs'
import { manageSecrets } from '../../composition.ts'
import { listGroups } from '../../domain/secret.ts'
import { confirmPrompt } from './prompt.ts'
import { ui } from './ui.ts'
import { groupMarkerPath, resolveGroup, unlockVault } from './unlock.ts'

// kv use             → show the active group and where it's pinned from
// kv use GROUP        → pin GROUP for this directory (writes/updates the
//                        .kv marker), offering to create the group first if
//                        it doesn't exist yet. This is the fast path for
//                        switching between projects: `cd project && kv use
//                        project` once, then every `apply`/`set`/`get`/`run`
//                        in that directory targets it without `--group`.
export async function cmdUse(group: string | undefined): Promise<void> {
  const vault = await unlockVault()

  if (!group) {
    const current = resolveGroup(undefined)
    const marker = groupMarkerPath()
    const pinned = existsSync(marker)
    console.log(`${ui.dim('group:')}  ${ui.bold(current)}`)
    console.log(
      `${ui.dim('source:')} ${pinned ? `pinned in ${marker}` : 'no .kv marker here — using "default"'}`,
    )
    const groups = listGroups(vault.data)
    console.log(ui.dim(`available: ${groups.join(', ')}`))
    return
  }

  if (!(group in vault.data.groups)) {
    if (!(await confirmPrompt(`Group "${group}" does not exist. Create it?`))) {
      console.log(ui.dim('Nothing changed.'))
      return
    }
    await manageSecrets.createGroup(vault, group)
  }

  const marker = groupMarkerPath()
  writeFileSync(marker, `${group}\n`)
  console.log(ui.ok(`Switched to group "${ui.bold(group)}"`) + ui.dim(` (pinned in ${marker})`))
}
