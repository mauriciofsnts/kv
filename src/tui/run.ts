import { WrongPasswordError } from '../core/crypto.ts'
import { loadSessionKey } from '../core/session.ts'
import { openVaultWithKey, vaultExists } from '../core/vault.ts'
import { useTuiStore } from './store.ts'

export async function runTui(): Promise<void> {
  if (!vaultExists()) {
    console.error('No vault found. Run `key init` first.')
    process.exit(1)
  }
  if (!process.stdout.isTTY) {
    console.error('The TUI needs an interactive terminal. Use the subcommands (key --help).')
    process.exit(1)
  }

  // An active session skips the password screen.
  const sessionKey = loadSessionKey()
  if (sessionKey) {
    try {
      const vault = openVaultWithKey(sessionKey)
      useTuiStore.setState({ vault, mode: 'browse' })
    } catch (err) {
      if (!(err instanceof WrongPasswordError)) throw err
    }
  }

  // Late import: only bring up the JSX runtime when the TUI is actually used.
  const { render } = await import('@termuijs/jsx')
  const { jsx } = await import('@termuijs/jsx/jsx-runtime')
  const { App } = await import('./App.tsx')
  await render(jsx(App, {}))
}
