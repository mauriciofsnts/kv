// Adapted from termcn (github.com/shadcn-labs/termcn) registry/bases/ink/ui/confirm.tsx.
// Import paths adjusted for kv's layout (no `@/` aliases).
import { Box, Text, useInput } from 'ink'
import { useState } from 'react'
import { useTheme } from '../theme/theme-provider.tsx'

export interface ConfirmProps {
  message: string
  onConfirm?: () => void
  onCancel?: () => void
  confirmLabel?: string
  cancelLabel?: string
  defaultValue?: boolean
  variant?: 'default' | 'danger'
}

export function Confirm({
  message,
  onConfirm,
  onCancel,
  confirmLabel = 'Yes',
  cancelLabel = 'No',
  defaultValue = false,
  variant = 'default',
}: ConfirmProps) {
  const theme = useTheme()
  const [selected, setSelected] = useState<boolean>(defaultValue)

  useInput((input, key) => {
    if (key.leftArrow || key.rightArrow) {
      setSelected((s) => !s)
    } else if (key.return) {
      if (selected) onConfirm?.()
      else onCancel?.()
    } else if (input === 'y' || input === 'Y') {
      onConfirm?.()
    } else if (input === 'n' || input === 'N') {
      onCancel?.()
    }
  })

  const yesColor = variant === 'danger' ? theme.colors.error : theme.colors.primary

  return (
    <Box flexDirection="column">
      <Text>
        <Text color={theme.colors.primary}>{'? '}</Text>
        {message}
      </Text>
      <Box gap={2} paddingLeft={2}>
        {selected ? (
          <Text color={yesColor} bold>
            {'› '}
            {confirmLabel}
          </Text>
        ) : (
          <Text color={theme.colors.mutedForeground}>
            {'  '}
            {confirmLabel}
          </Text>
        )}
        {selected ? (
          <Text color={theme.colors.mutedForeground}>
            {'  '}
            {cancelLabel}
          </Text>
        ) : (
          <Text bold>
            {'› '}
            {cancelLabel}
          </Text>
        )}
      </Box>
    </Box>
  )
}
