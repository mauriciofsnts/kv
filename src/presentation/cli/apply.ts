import type { ApplyAllResult } from '../../application/use-cases/apply-env.ts'
import { applyEnv, config } from '../../composition.ts'
import { listSecrets } from '../../domain/secret.ts'
import { confirmPrompt } from './prompt.ts'
import { ui, uiErr } from './ui.ts'
import { resolveGroup, unlockVault } from './unlock.ts'

interface ApplyOptions {
  group?: string
  envFile?: string
  from?: string
  force?: boolean
  safe?: boolean
}

function summarize({ applied, skipped, missing }: ApplyAllResult): string {
  const parts = [ui.ok(`${applied.length} applied`)]
  if (skipped.length > 0) {
    parts.push(ui.skip(`${skipped.length} already set, use -f to overwrite ${ui.dim(`(${skipped.join(', ')})`)}`))
  }
  if (missing.length > 0) {
    parts.push(ui.minus(`${missing.length} missing from vault ${ui.dim(`(${missing.join(', ')})`)}`))
  }
  return parts.join(ui.dim(' · '))
}

export async function cmdApply(target: string | undefined, options: ApplyOptions): Promise<void> {
  if (!target) {
    console.error(
      'Usage: kv apply <VARIABLE|all> [--group group] [--env file] [--from template] [--force|--safe]',
    )
    process.exit(1)
  }
  const envFile = options.envFile ?? '.env'
  // --safe wins over everything; otherwise -f, falling back to the persisted
  // default (`kv config force on` / KV_FORCE_APPLY).
  const force = options.safe ? false : (options.force ?? config.forceApply())

  // Template mode: generate the target from e.g. .env.example instead of
  // patching it in place.
  if (options.from) {
    if (target !== 'all') {
      console.error('The --from template mode applies all variables: kv apply all --from <template>')
      process.exit(1)
    }
    if (!applyEnv.envFileExists(options.from)) {
      console.error(uiErr.bad(`Template ${options.from} not found.`))
      process.exit(1)
    }
    const vault = await unlockVault()
    const group = resolveGroup(options.group)
    if (!(group in vault.data.groups)) {
      console.error(uiErr.bad(`Group "${group}" does not exist in the vault.`))
      process.exit(1)
    }
    const result = applyEnv.applyTemplate(vault, group, options.from, envFile, force)
    console.log(`${summarize(result)} → wrote ${ui.bold(envFile)} from ${options.from}${ui.group(group)}`)
    return
  }

  if (!applyEnv.envFileExists(envFile)) {
    console.error(uiErr.bad(`File ${envFile} not found.`))
    process.exit(1)
  }

  const vault = await unlockVault()
  const group = resolveGroup(options.group)
  if (!(group in vault.data.groups)) {
    console.error(uiErr.bad(`Group "${group}" does not exist in the vault.`))
    process.exit(1)
  }

  if (target === 'all') {
    const result = applyEnv.applyAll(vault, group, envFile, force)
    console.log(`${summarize(result)}${ui.group(group)}`)
    if (listSecrets(vault.data, group).length === 0) {
      console.log(ui.dim(`Tip: group "${group}" is empty. Use \`kv set NAME --group ${group}\`.`))
    }
    return
  }

  const result = applyEnv.applyOne(vault, group, target, envFile, force)
  if (result === 'applied') {
    console.log(ui.ok(`${ui.bold(target)} applied to ${envFile}`) + ui.group(group))
    return
  }
  if (result === 'skipped') {
    console.log(ui.skip(`${ui.bold(target)} already has a value in ${envFile} — use -f to overwrite.`))
    return
  }

  const shouldAppend = await confirmPrompt(
    `"${target}" is not in ${envFile}. Append it at the end?`,
  )
  if (!shouldAppend) {
    console.log(ui.dim('Nothing changed.'))
    return
  }
  applyEnv.appendOne(vault, group, target, envFile)
  console.log(ui.ok(`${ui.bold(target)} appended to ${envFile}`) + ui.group(group))
}
