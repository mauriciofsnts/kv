import { WrongPasswordError } from '../core/crypto.ts'
import { loadSessionKey } from '../core/session.ts'
import { openVaultWithKey, vaultExists } from '../core/vault.ts'
import { useTuiStore } from './store.ts'

export async function runTui(): Promise<void> {
  if (!vaultExists()) {
    console.error('Nenhum cofre encontrado. Rode `key init` primeiro.')
    process.exit(1)
  }
  if (!process.stdout.isTTY) {
    console.error('O TUI precisa de um terminal interativo. Use os subcomandos (key --help).')
    process.exit(1)
  }

  // Sessão ativa pula a tela de senha.
  const sessionKey = loadSessionKey()
  if (sessionKey) {
    try {
      const vault = openVaultWithKey(sessionKey)
      useTuiStore.setState({ vault, mode: 'browse' })
    } catch (err) {
      if (!(err instanceof WrongPasswordError)) throw err
    }
  }

  // Import tardio: subir o runtime JSX só quando o TUI é realmente usado.
  const { render } = await import('@termuijs/jsx')
  const { jsx } = await import('@termuijs/jsx/jsx-runtime')
  const { App } = await import('./App.tsx')
  await render(jsx(App, {}))
}
