import { applyEnv } from '../../composition.ts'
import { listSecrets } from '../../domain/secret.ts'
import { confirmPrompt } from './prompt.ts'
import { resolveGroup, unlockVault } from './unlock.ts'

interface ApplyOptions {
  group?: string
  envFile?: string
  from?: string
}

export async function cmdApply(target: string | undefined, options: ApplyOptions): Promise<void> {
  if (!target) {
    console.error('Usage: key apply <VARIABLE|all> [--group group] [--env file] [--from template]')
    process.exit(1)
  }
  const envFile = options.envFile ?? '.env'

  // Template mode: generate the target from e.g. .env.example instead of
  // patching it in place.
  if (options.from) {
    if (target !== 'all') {
      console.error('The --from template mode applies all variables: key apply all --from <template>')
      process.exit(1)
    }
    if (!applyEnv.envFileExists(options.from)) {
      console.error(`Template ${options.from} not found.`)
      process.exit(1)
    }
    const vault = await unlockVault()
    const group = resolveGroup(options.group)
    if (!(group in vault.data.groups)) {
      console.error(`Group "${group}" does not exist in the vault.`)
      process.exit(1)
    }
    const { applied, missing } = applyEnv.applyTemplate(vault, group, options.from, envFile)
    const parts = [`✓ ${applied.length} applied`]
    if (missing.length > 0) parts.push(`− ${missing.length} missing from vault (${missing.join(', ')})`)
    console.log(`${parts.join(' · ')} → wrote ${envFile} from ${options.from} [group: ${group}]`)
    return
  }

  if (!applyEnv.envFileExists(envFile)) {
    console.error(`File ${envFile} not found.`)
    process.exit(1)
  }

  const vault = await unlockVault()
  const group = resolveGroup(options.group)
  if (!(group in vault.data.groups)) {
    console.error(`Group "${group}" does not exist in the vault.`)
    process.exit(1)
  }

  if (target === 'all') {
    const { applied, missing } = applyEnv.applyAll(vault, group, envFile)
    const parts = [`✓ ${applied.length} applied`]
    if (missing.length > 0) parts.push(`− ${missing.length} missing from vault (${missing.join(', ')})`)
    console.log(`${parts.join(' · ')} [group: ${group}]`)
    if (listSecrets(vault.data, group).length === 0) {
      console.log(`Tip: group "${group}" is empty. Use \`key set NAME --group ${group}\`.`)
    }
    return
  }

  const result = applyEnv.applyOne(vault, group, target, envFile)
  if (result === 'applied') {
    console.log(`✓ ${target} applied to ${envFile} [group: ${group}]`)
    return
  }

  const shouldAppend = await confirmPrompt(
    `"${target}" is not in ${envFile}. Append it at the end?`,
  )
  if (!shouldAppend) {
    console.log('Nothing changed.')
    return
  }
  applyEnv.appendOne(vault, group, target, envFile)
  console.log(`✓ ${target} appended to ${envFile} [group: ${group}]`)
}
