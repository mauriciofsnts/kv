#!/usr/bin/env bun
import { parseArgs } from 'node:util'
import { cmdApply } from './cli/apply.ts'
import { cmdInit } from './cli/init.ts'
import { cmdGet, cmdList, cmdPasswd, cmdRm, cmdSet } from './cli/secrets.ts'
import { WrongPasswordError } from './core/crypto.ts'
import { clearSession } from './core/session.ts'
import { VaultExistsError, VaultNotFoundError } from './core/vault.ts'

const HELP = `key — gerenciador de envs criptografadas

Uso:
  key                       Abre o TUI
  key init                  Cria o cofre
  key apply <VAR|all>       Preenche valores no ./.env
  key set NOME              Grava uma secret (valor via prompt oculto)
  key get NOME              Imprime o valor de uma secret
  key list                  Lista grupos e nomes (nunca valores)
  key rm NOME               Remove uma secret
  key lock                  Encerra a sessão (volta a pedir senha)
  key passwd                Troca a senha do cofre

Opções:
  --group, -g <grupo>       Grupo do cofre (padrão: arquivo .key do diretório, senão "default")
  --env, -e <arquivo>       Arquivo alvo do apply (padrão: ./.env)
  --help, -h                Mostra esta ajuda

Variáveis de ambiente:
  KEY_VAULT_PATH            Caminho do cofre (padrão: ~/.config/key/vault.enc)
  KEY_SESSION_TTL           TTL da sessão em segundos (padrão: 900)
`

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      group: { type: 'string', short: 'g' },
      env: { type: 'string', short: 'e' },
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: true,
  })

  const [command, arg] = positionals

  if (values.help) {
    console.log(HELP)
    return
  }

  switch (command) {
    case undefined: {
      const { runTui } = await import('./tui/run.ts')
      await runTui()
      break
    }
    case 'init':
      await cmdInit()
      break
    case 'apply':
      await cmdApply(arg, { group: values.group, envFile: values.env })
      break
    case 'set':
      await cmdSet(arg, values.group)
      break
    case 'get':
      await cmdGet(arg, values.group)
      break
    case 'list':
      await cmdList(values.group)
      break
    case 'rm':
      await cmdRm(arg, values.group)
      break
    case 'lock':
      clearSession()
      console.log('Sessão encerrada.')
      break
    case 'passwd':
      await cmdPasswd()
      break
    case 'help':
      console.log(HELP)
      break
    default:
      console.error(`Comando desconhecido: ${command}\n`)
      console.error(HELP)
      process.exit(1)
  }
}

main().catch((err) => {
  if (
    err instanceof WrongPasswordError ||
    err instanceof VaultNotFoundError ||
    err instanceof VaultExistsError
  ) {
    console.error(err.message)
  } else if (err instanceof Error && err.message === 'cancelado') {
    console.error('Cancelado.')
  } else {
    console.error(err)
  }
  process.exit(1)
})
