/** @jsxImportSource @termuijs/jsx */
// Campo de texto próprio, desenhado com <text>. Não usamos TextInput/
// PasswordInput do @termuijs: na 0.1.7 eles são focáveis e o FocusManager
// do App passa a rotear todas as teclas só para eles (consumindo Tab e
// Enter), o que quebra a navegação do formulário. Aqui o componente pai é
// dono do foco e roteia as teclas via useInput.
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
  // Mantém o fim do valor visível quando ele passa da largura do campo.
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

// Aplica uma tecla de edição a um valor de campo; devolve null para teclas
// que não são de edição (navegação, enter, esc — o chamador decide).
export function editValue(value: string, key: string, event: KeyEvent): string | null {
  if (key === 'backspace') return value.slice(0, -1)
  if (key === 'u' && event.ctrl) return ''
  if (key.length === 1 && !event.ctrl && !event.alt) return value + key
  return null
}
