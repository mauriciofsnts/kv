/** @jsxImportSource @termuijs/jsx */
import type { KeyEvent } from '@termuijs/core'
import { useInput, useRef, useState } from '@termuijs/jsx'
import { removeSecret, saveVault, setSecret } from '../core/vault.ts'
import { Field, editValue } from './inputs.tsx'
import { useTuiStore } from './store.ts'

interface SecretFormProps {
  width: number
  height: number
  initialName?: string
  initialValue?: string
  initialNote?: string
}

// Formulário de add/edit: um único useInput roteia navegação (Tab/↑↓),
// Enter (salva), Esc (cancela) e edição de texto para o campo focado.
export function SecretForm({
  width,
  height,
  initialName = '',
  initialValue = '',
  initialNote = '',
}: SecretFormProps) {
  const [fields, setFields] = useState([initialName, initialValue, initialNote])
  const [focused, setFocused] = useState(0)
  const [error, setError] = useState('')

  // Refs espelham o estado: o handler do useInput pode ter closure de um
  // render antigo e precisa ler os valores atuais na hora do Enter/Tab.
  const fieldsRef = useRef(fields)
  fieldsRef.current = fields
  const focusedRef = useRef(0)
  focusedRef.current = focused

  const vault = useTuiStore((s) => s.vault)
  const group = useTuiStore((s) => s.group)
  const mode = useTuiStore((s) => s.mode)
  const setMode = useTuiStore((s) => s.setMode)
  const setStatus = useTuiStore((s) => s.setStatus)

  const [name, value, note] = fields as [string, string, string]
  const innerWidth = width - 4

  const save = () => {
    if (!vault) return
    const [currentName, currentValue, currentNote] = fieldsRef.current as [string, string, string]
    const trimmed = currentName.trim()
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed)) {
      setError('Nome inválido: use letras, números e _ (não pode começar com número).')
      return
    }
    if (mode === 'edit' && initialName && initialName !== trimmed) {
      removeSecret(vault, group, initialName)
    }
    setSecret(vault, group, trimmed, currentValue, currentNote.trim() || undefined)
    saveVault(vault)
    setStatus(`✓ ${trimmed} salva no grupo "${group}"`)
    setMode('browse')
  }

  useInput((key: string, event: KeyEvent) => {
    if (event.ctrl && key === 'c') process.exit(0)
    if (key === 'escape' || key === 'esc') {
      setMode('browse')
      return
    }
    if (key === 'tab' || key === 'down') {
      setFocused((f: number) => (f + (event.shift ? 2 : 1)) % 3)
      return
    }
    if (key === 'up') {
      setFocused((f: number) => (f + 2) % 3)
      return
    }
    if (key === 'enter' || key === 'return') {
      save()
      return
    }
    setFields((current: string[]) => {
      const index = focusedRef.current
      const edited = editValue(current[index]!, key, event)
      return edited !== null ? current.map((f, i) => (i === index ? edited : f)) : current
    })
  })

  return (
    <box flexDirection="column" padding={1} border="round" borderColor="yellow" gap={1} width={width} height={height}>
      <text height={1} width={innerWidth} bold color="yellow">
        {mode === 'edit' ? `Editar ${initialName}` : 'Nova secret'}
      </text>
      <Field label="Nome:" value={name} width={innerWidth} isFocused={focused === 0} placeholder="POSTGRES_DB" />
      <Field label="Valor:" value={value} width={innerWidth} isFocused={focused === 1} placeholder="valor da secret" />
      <Field label="Nota:" value={note} width={innerWidth} isFocused={focused === 2} placeholder="(opcional)" />
      {error ? <text height={1} width={innerWidth} color="red">{error}</text> : null}
      <text height={1} width={innerWidth} dim>Tab/↑↓ campos · Enter salva · Esc cancela</text>
    </box>
  )
}
