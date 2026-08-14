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

  // Late import: only bring up Ink/React when the TUI is actually used.
  const { render } = await import('ink')
  const { createElement } = await import('react')
  const { App } = await import('./App.tsx')
  // `alternateScreen` draws the TUI in the terminal's alternate screen
  // buffer (the same mechanism vim/htop/less use) so its redraws never
  // touch the user's real scrollback. Ink restores the primary buffer on
  // every exit path itself — normal unmount, the scattered `process.exit()`
  // calls in components, Ctrl+C, uncaught errors — via its own `signal-exit`
  // hook, so no manual escape-code handling is needed here.
  const instance = render(createElement(App), { alternateScreen: true })
  await instance.waitUntilExit()
}
