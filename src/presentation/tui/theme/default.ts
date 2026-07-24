import type { Theme } from './types.ts'

// Kept close to kv's existing palette (cyan for browse/focus, yellow for
// forms, red for errors/danger) rather than termcn's default purple theme.
export const defaultTheme: Theme = {
  name: 'kv',
  colors: {
    primary: 'cyan',
    success: 'green',
    warning: 'yellow',
    error: 'red',
    info: 'cyan',
    foreground: 'white',
    muted: 'gray',
    mutedForeground: 'gray',
    border: 'gray',
    focusRing: 'cyan',
  },
}
