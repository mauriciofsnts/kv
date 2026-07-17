/** @jsxImportSource @termuijs/jsx */
import { ErrorBoundary } from '@termuijs/jsx'
import { Dashboard } from './Dashboard.tsx'
import { UnlockScreen } from './UnlockScreen.tsx'
import { useTuiStore } from './store.ts'

export function App() {
  const vault = useTuiStore((s) => s.vault)
  return (
    <ErrorBoundary fallback={(err: Error) => <text color="red">Error: {err.message}</text>}>
      {vault ? <Dashboard /> : <UnlockScreen />}
    </ErrorBoundary>
  )
}
