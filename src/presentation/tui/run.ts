import { vaultAccess } from '../../composition.ts'
import { WrongPasswordError } from '../../domain/errors.ts'
import { useTuiStore } from './store.ts'

export async function runTui(): Promise<void> {
  if (!(await vaultAccess.exists())) {
    console.error('No vault found. Run `kv init` first.')
    process.exit(1)
  }
  if (!process.stdout.isTTY) {
    console.error('The TUI needs an interactive terminal. Use the subcommands (kv --help).')
    process.exit(1)
  }

  // An active session skips the password screen.
  try {
    const vault = await vaultAccess.openWithSession()
    if (vault) useTuiStore.setState({ vault, mode: 'browse' })
  } catch (err) {
    if (!(err instanceof WrongPasswordError)) throw err
  }

  // Late import: only bring up the JSX runtime when the TUI is actually used.
  const { render } = await import('@termuijs/jsx')
  const { jsx } = await import('@termuijs/jsx/jsx-runtime')
  const { App } = await import('./App.tsx')
  await render(jsx(App, {}))
}
