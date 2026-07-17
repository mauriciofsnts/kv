import { applyEnv } from '../../composition.ts'
import { resolveGroup, unlockVault } from './unlock.ts'

// key diff [--env file] [-g group]: drift report between the .env and the
// vault. Names and statuses only, never values. Exits 1 when values differ,
// so it can gate CI/scripts.
export async function cmdDiff(groupFlag?: string, envFlag?: string): Promise<void> {
  const envFile = envFlag ?? '.env'
  if (!applyEnv.envFileExists(envFile)) {
    console.error(`File ${envFile} not found.`)
    process.exit(1)
  }

  const vault = await unlockVault()
  const group = resolveGroup(groupFlag)
  if (!(group in vault.data.groups)) {
    console.error(`Group "${group}" does not exist in the vault.`)
    process.exit(1)
  }

  const diff = applyEnv.diff(vault, group, envFile)
  if (diff.inSync.length > 0) {
    console.log(`✓ ${diff.inSync.length} in sync (${diff.inSync.join(', ')})`)
  }
  for (const name of diff.differs) console.log(`~ ${name}  (value differs — \`key apply ${name}\` or \`key scan\`)`)
  for (const name of diff.missingFromVault) console.log(`− ${name}  (in ${envFile} but not in the vault)`)
  for (const name of diff.notInEnv) console.log(`+ ${name}  (in the vault but not in ${envFile})`)

  if (diff.differs.length === 0 && diff.missingFromVault.length === 0 && diff.notInEnv.length === 0) {
    console.log(`${envFile} matches group "${group}".`)
  }
  if (diff.differs.length > 0) process.exit(1)
}
