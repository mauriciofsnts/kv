/** @jsxImportSource @termuijs/jsx */
import type { KeyEvent } from '@termuijs/core'
import { useInput, useRef, useState } from '@termuijs/jsx'
import { manageSecrets } from '../../composition.ts'
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
// (save), Esc (cancel) and text editing to the focused field. Validation
// and persistence live in the manageSecrets use case, shared with the CLI.
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

  const save = async () => {
    if (!vault) return
    const [currentName, currentValue, currentNote, currentAliases] = fieldsRef.current as [
      string,
      string,
      string,
      string,
    ]
    try {
      const savedName = await manageSecrets.saveSecret(vault, group, {
        name: currentName,
        value: currentValue,
        note: currentNote,
        aliases: currentAliases.split(/[,\s]+/).filter((a) => a !== ''),
        previousName: mode === 'edit' ? initialName : undefined,
      })
      setStatus(`✓ ${savedName} saved to group "${group}"`)
      setMode('browse')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
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
      void save()
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
