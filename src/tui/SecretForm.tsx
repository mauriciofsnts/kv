/** @jsxImportSource @termuijs/jsx */
import type { KeyEvent } from '@termuijs/core'
import { useInput, useRef, useState } from '@termuijs/jsx'
import {
  NAME_PATTERN,
  ownerOfName,
  removeSecret,
  saveVault,
  setSecret,
} from '../core/vault.ts'
import { Field, editValue } from './inputs.tsx'
import { useTuiStore } from './store.ts'

interface SecretFormProps {
  width: number
  height: number
  initialName?: string
  initialValue?: string
  initialNote?: string
  initialAliases?: string[]
}

const FIELD_COUNT = 4

// Add/edit form: a single useInput routes navigation (Tab/↑↓), Enter
// (save), Esc (cancel) and text editing to the focused field.
export function SecretForm({
  width,
  height,
  initialName = '',
  initialValue = '',
  initialNote = '',
  initialAliases = [],
}: SecretFormProps) {
  const [fields, setFields] = useState([
    initialName,
    initialValue,
    initialNote,
    initialAliases.join(', '),
  ])
  const [focused, setFocused] = useState(0)
  const [error, setError] = useState('')

  // Refs mirror the state: the useInput handler may hold a closure from an
  // old render and needs the current values when Enter/Tab arrive.
  const fieldsRef = useRef(fields)
  fieldsRef.current = fields
  const focusedRef = useRef(0)
  focusedRef.current = focused

  const vault = useTuiStore((s) => s.vault)
  const group = useTuiStore((s) => s.group)
  const mode = useTuiStore((s) => s.mode)
  const setMode = useTuiStore((s) => s.setMode)
  const setStatus = useTuiStore((s) => s.setStatus)

  const [name, value, note, aliasesText] = fields as [string, string, string, string]
  const innerWidth = width - 4

  const save = () => {
    if (!vault) return
    const [currentName, currentValue, currentNote, currentAliases] = fieldsRef.current as [
      string,
      string,
      string,
      string,
    ]
    const trimmed = currentName.trim()
    if (!NAME_PATTERN.test(trimmed)) {
      setError('Invalid name: use letters, numbers and _ (cannot start with a number).')
      return
    }
    const aliases = currentAliases
      .split(/[,\s]+/)
      .map((a) => a.trim())
      .filter((a) => a !== '' && a !== trimmed)
    const badAlias = aliases.find((a) => !NAME_PATTERN.test(a))
    if (badAlias) {
      setError(`Invalid alias "${badAlias}": use letters, numbers and _.`)
      return
    }
    for (const alias of aliases) {
      const owner = ownerOfName(vault, group, alias)
      if (owner && owner !== trimmed && owner !== initialName) {
        setError(`Alias "${alias}" is already taken by "${owner}".`)
        return
      }
    }
    const owner = ownerOfName(vault, group, trimmed)
    if (owner && owner !== trimmed && owner !== initialName) {
      setError(`"${trimmed}" is already an alias of "${owner}".`)
      return
    }
    if (mode === 'edit' && initialName && initialName !== trimmed) {
      removeSecret(vault, group, initialName)
    }
    setSecret(vault, group, trimmed, currentValue, currentNote.trim() || undefined, aliases)
    // Persistence may hit a database; report failures instead of crashing.
    saveVault(vault).catch((err: unknown) =>
      setStatus(`✗ save failed: ${err instanceof Error ? err.message : String(err)}`),
    )
    setStatus(`✓ ${trimmed} saved to group "${group}"`)
    setMode('browse')
  }

  useInput((key: string, event: KeyEvent) => {
    if (event.ctrl && key === 'c') process.exit(0)
    if (key === 'escape' || key === 'esc') {
      setMode('browse')
      return
    }
    if (key === 'tab' || key === 'down') {
      setFocused((f: number) => (f + (event.shift ? FIELD_COUNT - 1 : 1)) % FIELD_COUNT)
      return
    }
    if (key === 'up') {
      setFocused((f: number) => (f + FIELD_COUNT - 1) % FIELD_COUNT)
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
        {mode === 'edit' ? `Edit ${initialName}` : 'New secret'}
      </text>
      <Field label="Name:" value={name} width={innerWidth} isFocused={focused === 0} placeholder="POSTGRES_DB" />
      <Field label="Value:" value={value} width={innerWidth} isFocused={focused === 1} placeholder="secret value" />
      <Field label="Note:" value={note} width={innerWidth} isFocused={focused === 2} placeholder="(optional)" />
      <Field label="Aliases:" value={aliasesText} width={innerWidth} isFocused={focused === 3} placeholder="DB_URL, POSTGRES_URL (optional)" />
      {error ? <text height={1} width={innerWidth} color="red">{error}</text> : null}
      <text height={1} width={innerWidth} dim>Tab/↑↓ fields · Enter saves · Esc cancels</text>
    </box>
  )
}
