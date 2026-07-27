// Adapted from termcn (github.com/shadcn-labs/termcn) registry/bases/ink/ui/types.ts.
// Trimmed to the color tokens actually consumed by the vendored components —
// this app doesn't use termcn's spacing/typography/motion/unicode tokens.
export interface ColorTokens {
  primary: string
  success: string
  warning: string
  error: string
  info: string
  foreground: string
  muted: string
  mutedForeground: string
  border: string
  focusRing: string
}

export interface Theme {
  name: string
  colors: ColorTokens
}
