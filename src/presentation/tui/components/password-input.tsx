// Adapted from termcn (github.com/shadcn-labs/termcn) registry/bases/ink/ui/password-input.tsx.
// Import paths adjusted for kv's layout (no `@/` aliases).
import { Box, Text, useFocus, useInput } from 'ink'
import type { BoxProps } from 'ink'
import { useState } from 'react'
import { useTheme } from '../theme/theme-provider.tsx'

export interface PasswordInputProps {
  value?: string
  onChange?: (value: string) => void
  onSubmit?: (value: string) => void
  placeholder?: string
  mask?: string
  label?: string
  id?: string
  autoFocus?: boolean
  bordered?: boolean
  borderStyle?: BoxProps['borderStyle']
  paddingX?: number
  width?: number
  cursor?: string
}

export function PasswordInput({
  value: controlledValue,
  onChange,
  onSubmit,
  placeholder = '',
  mask = '●',
  label,
  id,
  autoFocus = false,
  bordered = true,
  borderStyle = 'round',
  paddingX = 1,
  width,
  cursor = '█',
}: PasswordInputProps) {
  const [internalValue, setInternalValue] = useState('')
  const theme = useTheme()
  const { isFocused } = useFocus({ autoFocus, id })

  const value = controlledValue ?? internalValue

  const setValue = (next: string) => {
    if (onChange) onChange(next)
    else setInternalValue(next)
  }

  useInput((input, key) => {
    if (!isFocused) return

    if (key.return) {
      onSubmit?.(value)
      return
    }

    if (key.backspace || key.delete) {
      setValue(value.slice(0, -1))
      return
    }

    if (key.escape || key.upArrow || key.downArrow || key.tab || (key.ctrl && input === 'c')) return

    if (input && input.length > 0) setValue(value + input)
  })

  const displayValue = mask.repeat(value.length)
  const borderColor = isFocused ? theme.colors.focusRing : theme.colors.border

  const field = (
    <Box borderStyle={bordered ? borderStyle : undefined} borderColor={borderColor} paddingX={paddingX} width={width}>
      <Text color={value ? theme.colors.foreground : theme.colors.mutedForeground}>
        {displayValue || placeholder}
      </Text>
      {isFocused && <Text color={theme.colors.focusRing}>{cursor}</Text>}
    </Box>
  )

  return (
    <Box flexDirection="column">
      {label && <Text bold>{label}</Text>}
      {field}
    </Box>
  )
}
