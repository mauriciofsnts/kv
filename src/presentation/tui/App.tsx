import { ErrorBoundary } from './components/error-boundary.tsx'
import { Dashboard } from './Dashboard.tsx'
import { ThemeProvider } from './theme/theme-provider.tsx'
import { UnlockScreen } from './UnlockScreen.tsx'
import { useTuiStore } from './store.ts'

export function App() {
  const vault = useTuiStore((s) => s.vault)
  return (
    <ThemeProvider>
      <ErrorBoundary>{vault ? <Dashboard /> : <UnlockScreen />}</ErrorBoundary>
    </ThemeProvider>
  )
}
