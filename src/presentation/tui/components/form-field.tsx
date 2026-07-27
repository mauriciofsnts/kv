// Adapted from termcn (github.com/shadcn-labs/termcn) registry/bases/ink/ui/form-field.tsx.
// Import paths adjusted for kv's layout (no `@/` aliases).
import { Box, Text } from 'ink'
import type { ReactNode } from 'react'
import { useTheme } from '../theme/theme-provider.tsx'

export interface FormFieldProps {
  label: string
  children: ReactNode
  error?: string
  hint?: string
}

export function FormField({ label, children, error, hint }: FormFieldProps) {
  const theme = useTheme()

  return (
    <Box flexDirection="column">
      <Text bold>{label}</Text>
      <Box>{children}</Box>
      {hint && !error && (
        <Text color={theme.colors.mutedForeground} dimColor>
          {hint}
        </Text>
      )}
      {error && <Text color={theme.colors.error}>✗ {error}</Text>}
    </Box>
  )
}
