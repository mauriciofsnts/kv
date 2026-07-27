// Adapted from termcn (github.com/shadcn-labs/termcn) registry/bases/ink/ui/status-message.tsx.
// Trimmed to the variants kv's Footer actually uses (success/error); import
// paths adjusted for kv's layout (no `@/` aliases).
import { Box, Text } from 'ink'
import type { ReactNode } from 'react'
import { useTheme } from '../theme/theme-provider.tsx'

export type StatusVariant = 'success' | 'error'

const ICONS: Record<StatusVariant, string> = {
  success: '✓',
  error: '✗',
}

export interface StatusMessageProps {
  variant: StatusVariant
  children: ReactNode
}

export function StatusMessage({ variant, children }: StatusMessageProps) {
  const theme = useTheme()
  const color = variant === 'success' ? theme.colors.success : theme.colors.error

  return (
    <Box gap={1} flexDirection="row">
      <Text color={color}>{ICONS[variant]}</Text>
      <Text color={color}>{children}</Text>
    </Box>
  )
}
