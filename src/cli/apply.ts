import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { appendEnvVar, listEnvVars, setEnvValue } from '../core/envfile.ts'
import { listSecrets, resolveSecret } from '../core/vault.ts'
import { confirmPrompt } from './prompt.ts'
import { resolveGroup, unlockVault } from './unlock.ts'

interface ApplyOptions {
  group?: string
  envFile?: string
}

export async function cmdApply(target: string | undefined, options: ApplyOptions): Promise<void> {
  if (!target) {
    console.error('Usage: key apply <VARIABLE|all> [--group group] [--env file]')
    process.exit(1)
  }
  const envFile = options.envFile ?? '.env'
  if (!existsSync(envFile)) {
    console.error(`File ${envFile} not found.`)
    process.exit(1)
  }

  const vault = await unlockVault()
  const group = resolveGroup(options.group)
  if (!(group in vault.data.groups)) {
    console.error(`Group "${group}" does not exist in the vault.`)
    process.exit(1)
  }

  let content = readFileSync(envFile, 'utf8')

  if (target === 'all') {
    const applied: string[] = []
    const missing: string[] = []
    for (const { name } of listEnvVars(content)) {
      // resolveSecret matches canonical names and aliases alike.
      const resolved = resolveSecret(vault, group, name)
      if (resolved) {
        content = setEnvValue(content, name, resolved.secret.value).content
        applied.push(name)
      } else {
        missing.push(name)
      }
    }
    writeFileSync(envFile, content)
    const parts = [`✓ ${applied.length} applied`]
    if (missing.length > 0) parts.push(`− ${missing.length} missing from vault (${missing.join(', ')})`)
    console.log(`${parts.join(' · ')} [group: ${group}]`)
    if (listSecrets(vault, group).length === 0) {
      console.log(`Tip: group "${group}" is empty. Use \`key set NAME --group ${group}\`.`)
    }
    return
  }

  const resolved = resolveSecret(vault, group, target)
  if (!resolved) {
    console.error(`"${target}" does not exist in group "${group}" of the vault.`)
    process.exit(1)
  }

  const result = setEnvValue(content, target, resolved.secret.value)
  if (result.found) {
    writeFileSync(envFile, result.content)
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
  writeFileSync(envFile, appendEnvVar(content, target, resolved.secret.value))
  console.log(`✓ ${target} appended to ${envFile} [group: ${group}]`)
}
