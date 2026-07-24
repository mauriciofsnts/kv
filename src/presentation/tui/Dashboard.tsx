import { Box, Text, useInput, useWindowSize } from 'ink'
import { useState } from 'react'
import { manageSecrets } from '../../composition.ts'
import { type Secret, getSecret, listGroups, listSecrets } from '../../domain/secret.ts'
import { CLIPBOARD_CLEAR_SECONDS, copyToClipboard } from '../clipboard.ts'
import { Confirm } from './components/confirm.tsx'
import { StatusMessage } from './components/status-message.tsx'
import { SecretForm } from './SecretForm.tsx'
import { useTuiStore } from './store.ts'

const MASK = '••••••••'
const SIDEBAR_WIDTH = 24
const NAME_COL = 28
const DATE_COL = 10

function visibleSecrets(filter: string, secrets: [string, Secret][]): [string, Secret][] {
  if (!filter) return secrets
  const needle = filter.toLowerCase()
  return secrets.filter(
    ([name, secret]) =>
      name.toLowerCase().includes(needle) ||
      secret.aliases?.some((a) => a.toLowerCase().includes(needle)),
  )
}

function reportSaveError(err: unknown): void {
  useTuiStore
    .getState()
    .setStatus(err instanceof Error ? err.message : String(err), 'error')
}

export function Dashboard() {
  const { columns: cols, rows } = useWindowSize()
  const mode = useTuiStore((s) => s.mode)
  const panelHeight = Math.max(8, rows - 2)
  const mainWidth = Math.max(40, cols - SIDEBAR_WIDTH - 1)

  return (
    <Box flexDirection="column" height={rows} width={cols}>
      <Box flexDirection="row" gap={1} height={panelHeight} width={cols}>
        <GroupSidebar height={panelHeight} />
        {mode === 'add' || mode === 'edit' ? (
          <FormPanel width={mainWidth} height={panelHeight} />
        ) : (
          <SecretList width={mainWidth} height={panelHeight} />
        )}
      </Box>
      <Footer width={cols} />
    </Box>
  )
}

interface PanelProps {
  width?: number
  height: number
}

function FormPanel({ width, height }: PanelProps) {
  const mode = useTuiStore((s) => s.mode)
  const vault = useTuiStore((s) => s.vault)
  const group = useTuiStore((s) => s.group)
  const selected = useTuiStore((s) => s.selected)
  const filter = useTuiStore((s) => s.filter)

  if (mode === 'edit' && vault) {
    const entry = visibleSecrets(filter, listSecrets(vault.data, group))[selected]
    if (entry) {
      const [name, secret] = entry
      return (
        <SecretForm
          width={width!}
          height={height}
          initialName={name}
          initialValue={secret.value}
          initialNote={secret.note ?? ''}
          initialAliases={secret.aliases ?? []}
        />
      )
    }
  }
  return <SecretForm width={width!} height={height} />
}

function GroupSidebar({ height }: PanelProps) {
  const vault = useTuiStore((s) => s.vault)
  const group = useTuiStore((s) => s.group)
  const groups = vault ? listGroups(vault.data) : []

  return (
    <Box flexDirection="column" padding={1} borderStyle="round" borderColor="white" width={SIDEBAR_WIDTH} height={height}>
      <Text bold dimColor>Groups ←/→</Text>
      {groups.map((g) => (
        <Text key={g} color={g === group ? 'cyan' : undefined} bold={g === group} wrap="truncate-end">
          {g === group ? '▸ ' : '  '}{g}
        </Text>
      ))}
    </Box>
  )
}

function SecretList({ width, height }: PanelProps) {
  const vault = useTuiStore((s) => s.vault)
  const group = useTuiStore((s) => s.group)
  const mode = useTuiStore((s) => s.mode)
  const selected = useTuiStore((s) => s.selected)
  const filter = useTuiStore((s) => s.filter)
  const revealed = useTuiStore((s) => s.revealed)

  const secrets = vault ? visibleSecrets(filter, listSecrets(vault.data, group)) : []
  const innerWidth = width! - 4
  const valueCol = Math.max(10, innerWidth - NAME_COL - DATE_COL - 2)
  // Scroll window: keeps the selection visible when there are more rows
  // than vertical space.
  const maxRows = Math.max(1, height - 5)
  const start = Math.max(0, Math.min(selected - maxRows + 1, secrets.length - maxRows))
  const windowed = secrets.slice(start, start + maxRows)

  return (
    <Box flexDirection="column" padding={1} borderStyle="round" borderColor="cyan" width={width} height={height}>
      <Text bold color="cyan">
        Secrets · {group}{filter ? `  /${filter}` : ''}
      </Text>
      {secrets.length === 0 ? (
        <Text dimColor>
          {filter ? 'No matches.' : 'Empty. Press "a" to add.'}
        </Text>
      ) : (
        windowed.map(([name, secret], offset) => {
          const index = start + offset
          const isSelected = index === selected
          const shown = revealed[name] ? secret.value : MASK
          const aliasBadge = secret.aliases?.length ? ` +${secret.aliases.length}` : ''
          return (
            <Box key={name} flexDirection="row" gap={1} width={innerWidth}>
              <Box width={NAME_COL}>
                <Text color={isSelected ? 'cyan' : undefined} bold={isSelected}>
                  {isSelected ? '▸ ' : '  '}{name}{aliasBadge}
                </Text>
              </Box>
              <Box width={valueCol}>
                <Text dimColor={!revealed[name]}>{shown}</Text>
              </Box>
              <Box width={DATE_COL}>
                <Text dimColor>{secret.updatedAt.slice(0, 10)}</Text>
              </Box>
            </Box>
          )
        })
      )}
      {mode === 'browse' ? <BrowseKeymap count={secrets.length} names={secrets.map(([n]) => n)} /> : null}
      {mode === 'filter' ? <FilterInput width={innerWidth} /> : null}
      {mode === 'confirm-delete' ? <ConfirmDelete names={secrets.map(([n]) => n)} /> : null}
      {mode === 'new-group' ? <NewGroupInput width={innerWidth} /> : null}
      {mode === 'move' ? <MoveTarget width={innerWidth} names={secrets.map(([n]) => n)} /> : null}
    </Box>
  )
}

// Browse-mode keymap. Lives in its own component so it is only active in
// "browse" mode (otherwise "a", "d" etc. would capture form typing). Actions
// read everything via getState() to always see the latest store state.
function BrowseKeymap({ count, names }: { count: number; names: string[] }) {
  const clampedSelect = (offset: number) => {
    if (count === 0) return
    const s = useTuiStore.getState()
    s.setSelected((s.selected + offset + count) % count)
  }
  const switchGroup = (offset: number) => {
    const s = useTuiStore.getState()
    if (!s.vault) return
    const groups = listGroups(s.vault.data)
    const current = groups.indexOf(s.group)
    const next = groups[(current + offset + groups.length) % groups.length]
    if (next) s.setGroup(next)
  }
  const setMode = (mode: 'add' | 'edit' | 'confirm-delete' | 'filter' | 'new-group' | 'move') =>
    useTuiStore.getState().setMode(mode)

  useInput((input, key) => {
    if (key.upArrow || input === 'k') clampedSelect(-1)
    else if (key.downArrow || input === 'j') clampedSelect(1)
    else if (key.leftArrow) switchGroup(-1)
    else if (key.rightArrow) switchGroup(1)
    else if (input === 'a') setMode('add')
    else if (input === 'e') { if (count > 0) setMode('edit') }
    else if (input === 'd') { if (count > 0) setMode('confirm-delete') }
    else if (input === 'v') {
      const s = useTuiStore.getState()
      const name = names[s.selected]
      if (name) s.toggleReveal(name)
    } else if (input === 'c') {
      const s = useTuiStore.getState()
      const name = names[s.selected]
      const secret = s.vault && name ? getSecret(s.vault.data, s.group, name) : undefined
      if (!name || !secret) return
      copyToClipboard(secret.value)
        .then(() => s.setStatus(`${name} copied (clears in ${CLIPBOARD_CLEAR_SECONDS}s)`, 'success'))
        .catch((err: unknown) => s.setStatus(err instanceof Error ? err.message : String(err), 'error'))
    } else if (input === 'm') {
      // Needs at least a source and one other secret to move onto.
      if (count < 2) return
      const s = useTuiStore.getState()
      const name = names[s.selected]
      if (!name) return
      s.setMoveSource(name)
      s.setMode('move')
    } else if (input === '/') setMode('filter')
    else if (input === 'g') setMode('new-group')
    else if (key.escape) useTuiStore.getState().setFilter('')
    else if (input === 'q') process.exit(0)
  })
  return null
}

function FilterInput({ width }: { width: number }) {
  const filter = useTuiStore((s) => s.filter)

  useInput((input, key) => {
    const s = useTuiStore.getState()
    if (key.escape) {
      s.setFilter('')
      s.setMode('browse')
      return
    }
    if (key.return) {
      s.setMode('browse')
      return
    }
    if (key.backspace || key.delete) {
      s.setFilter(s.filter.slice(0, -1))
      return
    }
    if (input.length === 1 && !key.ctrl && !key.meta) s.setFilter(s.filter + input)
  })

  return (
    <Box width={width}>
      <Text color="yellow">search: {filter}▏ (Enter keeps, Esc clears)</Text>
    </Box>
  )
}

function ConfirmDelete({ names }: { names: string[] }) {
  const selected = useTuiStore((s) => s.selected)
  const name = names[selected]

  const doDelete = () => {
    const s = useTuiStore.getState()
    const target = names[s.selected]
    if (s.vault && target) {
      manageSecrets.deleteSecret(s.vault, s.group, target).catch(reportSaveError)
      s.setStatus(`${target} removed`, 'success')
      s.setSelected(Math.max(0, s.selected - 1))
    }
    s.setMode('browse')
  }
  const cancel = () => useTuiStore.getState().setMode('browse')

  useInput((_input, key) => {
    if (key.escape) cancel()
  })

  return <Confirm message={`Remove ${name}?`} variant="danger" onConfirm={doDelete} onCancel={cancel} />
}

function NewGroupInput({ width }: { width: number }) {
  const [name, setName] = useState('')

  useInput((input, key) => {
    const s = useTuiStore.getState()
    if (key.escape) {
      s.setMode('browse')
      return
    }
    if (key.return) {
      const trimmed = name.trim()
      if (s.vault && trimmed) {
        manageSecrets.createGroup(s.vault, trimmed).catch(reportSaveError)
        s.setGroup(trimmed)
        s.setStatus(`group "${trimmed}" created`, 'success')
      }
      s.setMode('browse')
      return
    }
    if (key.backspace || key.delete) {
      setName((n) => n.slice(0, -1))
      return
    }
    if (input.length === 1 && !key.ctrl && !key.meta) setName((n) => n + input)
  })

  return (
    <Box width={width}>
      <Text color="yellow">new group: {name}▏ (Enter creates, Esc cancels)</Text>
    </Box>
  )
}

// Move-as-alias flow: ↑↓ pick the target, Enter asks to confirm, y applies.
// The source's value is discarded (the target's wins); the confirm line
// warns when that actually loses data. The component (with its input hook)
// only exists while mode === 'move'.
function MoveTarget({ width, names }: { width: number; names: string[] }) {
  const [confirming, setConfirming] = useState(false)
  const source = useTuiStore((s) => s.moveSource)
  const selected = useTuiStore((s) => s.selected)
  const vault = useTuiStore((s) => s.vault)
  const group = useTuiStore((s) => s.group)

  const apply = () => {
    const s = useTuiStore.getState()
    const target = names[s.selected]
    if (s.vault && s.moveSource && target) {
      manageSecrets
        .mergeAsAlias(s.vault, s.group, s.moveSource, target)
        .then(({ target: canonical, moved }) => {
          const st = useTuiStore.getState()
          st.setStatus(`${moved.join(', ')} → ${canonical}`, 'success')
          st.setSelected(0)
        })
        .catch(reportSaveError)
    }
    s.setMoveSource(null)
    s.setMode('browse')
  }

  useInput((input, key) => {
    const s = useTuiStore.getState()
    if (key.escape) {
      if (confirming) {
        setConfirming(false)
        return
      }
      s.setMoveSource(null)
      s.setMode('browse')
      return
    }
    if (confirming) {
      if (input === 'y') apply()
      else if (input === 'n') setConfirming(false)
      return
    }
    if ((key.upArrow || input === 'k') && names.length > 0) {
      s.setSelected((s.selected - 1 + names.length) % names.length)
      return
    }
    if ((key.downArrow || input === 'j') && names.length > 0) {
      s.setSelected((s.selected + 1) % names.length)
      return
    }
    if (key.return) {
      const target = names[s.selected]
      if (!target || target === s.moveSource) {
        s.setStatus('pick a different secret as the target', 'error')
        return
      }
      setConfirming(true)
    }
  })

  const target = names[selected]
  if (confirming && source && target) {
    const valuesDiffer =
      vault &&
      getSecret(vault.data, group, source)?.value !== getSecret(vault.data, group, target)?.value
    return (
      <Box width={width}>
        <Text color="red">
          {source} becomes an alias of {target}{valuesDiffer ? ' — values differ, its value is discarded' : ''}. [y/n]
        </Text>
      </Box>
    )
  }
  return (
    <Box width={width}>
      <Text color="yellow">
        move: {source} → {target ?? '?'} (↑↓ target · Enter confirm · Esc cancel)
      </Text>
    </Box>
  )
}

function Footer({ width }: { width?: number }) {
  const status = useTuiStore((s) => s.status)
  const statusVariant = useTuiStore((s) => s.statusVariant)
  return (
    <Box flexDirection="column" height={2} width={width}>
      {status ? <StatusMessage variant={statusVariant}>{status}</StatusMessage> : <Text> </Text>}
      <Text dimColor>
        ↑↓ move · ←→ group · a add · e edit · d delete · v reveal · c copy · m alias · / search · g new group · q quit
      </Text>
    </Box>
  )
}
