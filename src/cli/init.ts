import { vaultPath } from '../core/paths.ts'
import { storeSessionKey } from '../core/session.ts'
import { createVault, vaultExists } from '../core/vault.ts'
import { hiddenPrompt } from './prompt.ts'

export async function cmdInit(): Promise<void> {
  const path = vaultPath()
  if (vaultExists(path)) {
    console.error(`Já existe um cofre em ${path}.`)
    process.exit(1)
  }
  const password = await hiddenPrompt('Nova senha do cofre: ')
  if (password.length < 8) {
    console.error('A senha precisa ter pelo menos 8 caracteres.')
    process.exit(1)
  }
  const confirmation = await hiddenPrompt('Confirme a senha: ')
  if (password !== confirmation) {
    console.error('As senhas não conferem.')
    process.exit(1)
  }
  const vault = createVault(password, path)
  storeSessionKey(vault.key)
  console.log(`Cofre criado em ${path}.`)
  console.log('Use `key set NOME` para gravar secrets ou `key` para abrir o TUI.')
}
