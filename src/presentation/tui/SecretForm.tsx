import { Box, Text, useFocusManager, useInput } from 'ink'
import { useState } from 'react'
import { manageSecrets } from '../../composition.ts'
import { FormField } from './components/form-field.tsx'
import { TextInput } from './components/text-input.tsx'
import { useTuiStore } from './store.ts'

interface SecretFormProps {
  width: number
  height: number
  initialName?: string
  initialValue?: string
  initialNote?: string
  initialAliases?: string[]
}

// Add/edit form: each field is a vendored TextInput with its own onSubmit,
// so Enter saves from whichever field is focused — Tab/Shift+Tab cycling
// between fields is native via Ink's FocusManager (useFocus), no manual
// focus index needed. Validation and persistence live in the manageSecrets
// use case, shared with the CLI.
export function SecretForm({
  width,
  height,
  initialName = '',
  initialValue = '',
  initialNote = '',
  initialAliases = [],
}: SecretFormProps) {
  const [name, setName] = useState(initialName)
  const [value, setValue] = useState(initialValue)
  const [note, setNote] = useState(initialNote)
  const [aliasesText, setAliasesText] = useState(initialAliases.join(', '))
  const [error, setError] = useState('')

  const vault = useTuiStore((s) => s.vault)
  const group = useTuiStore((s) => s.group)
  const mode = useTuiStore((s) => s.mode)
  const setMode = useTuiStore((s) => s.setMode)
  const setStatus = useTuiStore((s) => s.setStatus)

  const innerWidth = width - 4

  const save = async () => {
    if (!vault) return
    try {
      const savedName = await manageSecrets.saveSecret(vault, group, {
        name,
        value,
        note,
        aliases: aliasesText.split(/[,\s]+/).filter((a) => a !== ''),
        previousName: mode === 'edit' ? initialName : undefined,
      })
      setStatus(`${savedName} saved to group "${group}"`, 'success')
      setMode('browse')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const { focusNext, focusPrevious } = useFocusManager()

  useInput((input, key) => {
    if (key.ctrl && input === 'c') process.exit(0)
    if (key.escape) {
      setMode('browse')
      return
    }
    // Tab/Shift+Tab already cycle focus natively via Ink's FocusManager;
    // ↑↓ do the same for parity with the rest of the app's navigation.
    if (key.downArrow) focusNext()
    if (key.upArrow) focusPrevious()
  })

  return (
    <Box flexDirection="column" padding={1} borderStyle="round" borderColor="yellow" gap={1} width={width} height={height}>
      <Text bold color="yellow">{mode === 'edit' ? `Edit ${initialName}` : 'New secret'}</Text>
      <FormField label="Name">
        <TextInput value={name} onChange={setName} onSubmit={save} placeholder="POSTGRES_DB" width={innerWidth} bordered={false} autoFocus />
      </FormField>
      <FormField label="Value">
        <TextInput value={value} onChange={setValue} onSubmit={save} placeholder="secret value" width={innerWidth} bordered={false} />
      </FormField>
      <FormField label="Note">
        <TextInput value={note} onChange={setNote} onSubmit={save} placeholder="(optional)" width={innerWidth} bordered={false} />
      </FormField>
      <FormField label="Aliases">
        <TextInput
          value={aliasesText}
          onChange={setAliasesText}
          onSubmit={save}
          placeholder="DB_URL, POSTGRES_URL (optional)"
          width={innerWidth}
          bordered={false}
        />
      </FormField>
      {error ? <Text color="red">{error}</Text> : null}
      <Text dimColor>Tab/↑↓ fields · Enter saves · Esc cancels</Text>
    </Box>
  )
}
