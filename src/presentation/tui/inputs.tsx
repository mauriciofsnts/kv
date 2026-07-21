/** @jsxImportSource @termuijs/jsx */
// Hand-rolled text field drawn with <text>. We don't use TextInput/
// PasswordInput from @termuijs: in 0.1.7 they are focusable and the App's
// FocusManager starts routing every key exclusively to them (swallowing Tab
// and Enter), which breaks form navigation. Here the parent component owns
// focus and routes keys via useInput.
import type { KeyEvent } from '@termuijs/core'

interface FieldProps {
  label: string
  value: string
  width: number
  labelWidth?: number
  isFocused: boolean
  mask?: boolean
  placeholder?: string
}

export function Field({ label, value, width, labelWidth = 8, isFocused, mask, placeholder }: FieldProps) {
  const inner = Math.max(4, width - labelWidth - 1)
  const shown = mask ? '●'.repeat(value.length) : value
  // Keep the end of the value visible when it exceeds the field width.
  const clipped = shown.length > inner - 1 ? '…' + shown.slice(-(inner - 2)) : shown
  const body =
    value === '' && !isFocused && placeholder ? placeholder : clipped + (isFocused ? '▏' : '')

  return (
    <box flexDirection="row" gap={1} height={1} width={width}>
      <text height={1} width={labelWidth} color={isFocused ? 'cyan' : undefined} bold={isFocused}>
        {label}
      </text>
      <text height={1} width={inner} dim={value === '' && !isFocused}>
        {body}
      </text>
    </box>
  )
}

// Applies an editing key to a field value; returns null for keys that are
// not edits (navigation, enter, esc — the caller decides).
export function editValue(value: string, key: string, event: KeyEvent): string | null {
  if (key === 'backspace') return value.slice(0, -1)
  if (key === 'u' && event.ctrl) return ''
  // @termuijs/core reports the space bar as the key name "space" rather
  // than a literal " " character (see its SPECIAL_KEYS table), so it needs
  // its own branch alongside the single-character case below.
  if (key === 'space' && !event.ctrl && !event.alt) return value + ' '
  if (key.length === 1 && !event.ctrl && !event.alt) return value + key
  return null
}
