// Adapted from termcn (github.com/shadcn-labs/termcn) registry/bases/ink/ui/theme-provider.tsx.
// Trimmed to the theme context only — this app has one theme and doesn't
// need termcn's auto light/dark switching or motion/unicode detection.
import * as React from 'react'
import { defaultTheme } from './default.ts'
import type { Theme } from './types.ts'

interface ThemeContextValue {
  theme: Theme
}

const ThemeContext = React.createContext<ThemeContextValue>({ theme: defaultTheme })

export function ThemeProvider({ children, theme = defaultTheme }: { children: React.ReactNode; theme?: Theme }) {
  const value = React.useMemo(() => ({ theme }), [theme])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): Theme {
  return React.useContext(ThemeContext).theme
}
