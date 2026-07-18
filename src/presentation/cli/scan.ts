import { applyEnv, manageSecrets } from '../../composition.ts'
import { confirmPrompt } from './prompt.ts'
import { ui, uiErr } from './ui.ts'
import { resolveGroup, unlockVault } from './unlock.ts'

// key scan [--env file] [-g group]: import the variables of an existing
// .env into the vault. Prints names and statuses only, never values.
export async function cmdScan(groupFlag?: string, envFlag?: string): Promise<void> {
  const envFile = envFlag ?? '.env'
  if (!applyEnv.envFileExists(envFile)) {
    console.error(uiErr.bad(`File ${envFile} not found.`))
    process.exit(1)
  }

  const vault = await unlockVault()
  const group = resolveGroup(groupFlag)
  const entries = applyEnv.readEntries(envFile)
  if (entries.length === 0) {
    console.log(ui.dim(`No variables found in ${envFile}.`))
    return
  }

  const plan = manageSecrets.planImport(vault, group, entries)
  for (const name of plan.add) console.log(ui.add(`${name}  ${ui.dim('(new)')}`))
  for (const name of plan.replace) {
    console.log(ui.change(`${name}  ${ui.dim('(vault value will be updated)')}`))
  }
  for (const name of plan.unchanged) console.log(ui.same(`${name}  ${ui.dim('(already in sync)')}`))
  for (const { name, owner } of plan.conflicts) {
    console.log(ui.bad(`${name}  ${ui.dim(`(alias of "${owner}" — skipped)`)}`))
  }

  const changes = plan.add.length + plan.replace.length
  if (changes === 0) {
    console.log(ui.dim(`Nothing to import into group "${group}".`))
    return
  }
  if (!(await confirmPrompt(`Import ${changes} variable${changes === 1 ? '' : 's'} into group "${group}"?`))) {
    console.log(ui.dim('Nothing imported.'))
    return
  }
  const { added, replaced } = await manageSecrets.importEntries(vault, group, entries)
  const parts: string[] = []
  if (added.length > 0) parts.push(`${added.length} added`)
  if (replaced.length > 0) parts.push(`${replaced.length} updated`)
  console.log(ui.ok(parts.join(ui.dim(' · '))) + ui.group(group))
}
