import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { appendEnvVar, listEnvVars, setEnvValue } from '../core/envfile.ts'
import { getSecret, listSecrets } from '../core/vault.ts'
import { confirmPrompt } from './prompt.ts'
import { resolveGroup, unlockVault } from './unlock.ts'

interface ApplyOptions {
  group?: string
  envFile?: string
}

export async function cmdApply(target: string | undefined, options: ApplyOptions): Promise<void> {
  if (!target) {
    console.error('Uso: key apply <VARIAVEL|all> [--group grupo] [--env arquivo]')
    process.exit(1)
  }
  const envFile = options.envFile ?? '.env'
  if (!existsSync(envFile)) {
    console.error(`Arquivo ${envFile} não encontrado.`)
    process.exit(1)
  }

  const vault = await unlockVault()
  const group = resolveGroup(options.group)
  if (!(group in vault.data.groups)) {
    console.error(`Grupo "${group}" não existe no cofre.`)
    process.exit(1)
  }

  let content = readFileSync(envFile, 'utf8')

  if (target === 'all') {
    const applied: string[] = []
    const missing: string[] = []
    for (const { name } of listEnvVars(content)) {
      const secret = getSecret(vault, group, name)
      if (secret) {
        content = setEnvValue(content, name, secret.value).content
        applied.push(name)
      } else {
        missing.push(name)
      }
    }
    writeFileSync(envFile, content)
    const parts = [`✓ ${applied.length} aplicada${applied.length === 1 ? '' : 's'}`]
    if (missing.length > 0) parts.push(`− ${missing.length} sem valor no cofre (${missing.join(', ')})`)
    console.log(`${parts.join(' · ')} [grupo: ${group}]`)
    if (listSecrets(vault, group).length === 0) {
      console.log(`Dica: o grupo "${group}" está vazio. Use \`key set NOME --group ${group}\`.`)
    }
    return
  }

  const secret = getSecret(vault, group, target)
  if (!secret) {
    console.error(`"${target}" não existe no grupo "${group}" do cofre.`)
    process.exit(1)
  }

  const result = setEnvValue(content, target, secret.value)
  if (result.found) {
    writeFileSync(envFile, result.content)
    console.log(`✓ ${target} aplicada em ${envFile} [grupo: ${group}]`)
    return
  }

  const shouldAppend = await confirmPrompt(
    `"${target}" não existe em ${envFile}. Acrescentar no final?`,
  )
  if (!shouldAppend) {
    console.log('Nada alterado.')
    return
  }
  writeFileSync(envFile, appendEnvVar(content, target, secret.value))
  console.log(`✓ ${target} acrescentada em ${envFile} [grupo: ${group}]`)
}
