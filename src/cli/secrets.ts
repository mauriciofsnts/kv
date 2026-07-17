import { clearSession } from '../core/session.ts'
import {
  getSecret,
  listGroups,
  listSecrets,
  rekeyVault,
  removeSecret,
  saveVault,
  setSecret,
} from '../core/vault.ts'
import { confirmPrompt, hiddenPrompt } from './prompt.ts'
import { resolveGroup, unlockVault } from './unlock.ts'

export async function cmdSet(name: string | undefined, groupFlag?: string): Promise<void> {
  if (!name) {
    console.error('Uso: key set NOME [--group grupo]')
    process.exit(1)
  }
  const vault = await unlockVault()
  const group = resolveGroup(groupFlag)
  // Valor via prompt oculto: passar por argv vazaria no histórico do shell e no ps.
  const value = await hiddenPrompt(`Valor de ${name}: `)
  setSecret(vault, group, name, value)
  saveVault(vault)
  console.log(`✓ ${name} gravada no grupo "${group}".`)
}

export async function cmdGet(name: string | undefined, groupFlag?: string): Promise<void> {
  if (!name) {
    console.error('Uso: key get NOME [--group grupo]')
    process.exit(1)
  }
  const vault = await unlockVault()
  const group = resolveGroup(groupFlag)
  const secret = getSecret(vault, group, name)
  if (!secret) {
    console.error(`"${name}" não existe no grupo "${group}".`)
    process.exit(1)
  }
  process.stdout.write(secret.value + (process.stdout.isTTY ? '\n' : ''))
}

export async function cmdList(groupFlag?: string): Promise<void> {
  const vault = await unlockVault()
  if (groupFlag) {
    for (const [name] of listSecrets(vault, groupFlag)) console.log(name)
    return
  }
  for (const group of listGroups(vault)) {
    const secrets = listSecrets(vault, group)
    console.log(`${group} (${secrets.length})`)
    for (const [name] of secrets) console.log(`  ${name}`)
  }
}

export async function cmdRm(name: string | undefined, groupFlag?: string): Promise<void> {
  if (!name) {
    console.error('Uso: key rm NOME [--group grupo]')
    process.exit(1)
  }
  const vault = await unlockVault()
  const group = resolveGroup(groupFlag)
  if (!getSecret(vault, group, name)) {
    console.error(`"${name}" não existe no grupo "${group}".`)
    process.exit(1)
  }
  if (!(await confirmPrompt(`Remover ${name} do grupo "${group}"?`))) {
    console.log('Nada alterado.')
    return
  }
  removeSecret(vault, group, name)
  saveVault(vault)
  console.log(`✓ ${name} removida.`)
}

export async function cmdPasswd(): Promise<void> {
  const vault = await unlockVault()
  const password = await hiddenPrompt('Nova senha: ')
  if (password.length < 8) {
    console.error('A senha precisa ter pelo menos 8 caracteres.')
    process.exit(1)
  }
  const confirmation = await hiddenPrompt('Confirme a nova senha: ')
  if (password !== confirmation) {
    console.error('As senhas não conferem.')
    process.exit(1)
  }
  rekeyVault(vault, password)
  clearSession()
  console.log('✓ Senha trocada. A sessão foi encerrada; a próxima operação pedirá a nova senha.')
}
