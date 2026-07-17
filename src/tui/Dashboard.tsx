/** @jsxImportSource @termuijs/jsx */
// NOTE on dimensions: the @termuijs 0.1.7 layout engine does not measure
// content on the main axis (flexGrow/auto become 0 and the widget vanishes).
// Every box/text here therefore carries explicit width/height, computed from
// the terminal size.
import type { KeyEvent } from '@termuijs/core'
import { useInput, useKeymap, useRef, useState } from '@termuijs/jsx'
import {
  type Secret,
  listGroups,
  listSecrets,
  removeSecret,
  saveVault,
} from '../core/vault.ts'
import { SecretForm } from './SecretForm.tsx'
import { useTuiStore } from './store.ts'
import { useTermSize } from './useTermSize.ts'

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

export function Dashboard() {
  const { cols, rows } = useTermSize()
  const mode = useTuiStore((s) => s.mode)
  const panelHeight = Math.max(8, rows - 2)
  const mainWidth = Math.max(40, cols - SIDEBAR_WIDTH - 1)

  return (
    <box flexDirection="column" height={rows} width={cols}>
      <box flexDirection="row" gap={1} height={panelHeight} width={cols}>
        <GroupSidebar height={panelHeight} />
        {mode === 'add' || mode === 'edit' ? (
          <FormPanel width={mainWidth} height={panelHeight} />
        ) : (
          <SecretList width={mainWidth} height={panelHeight} />
        )}
      </box>
      <Footer width={cols} />
    </box>
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
    const entry = visibleSecrets(filter, listSecrets(vault, group))[selected]
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
  const groups = vault ? listGroups(vault) : []
  const innerWidth = SIDEBAR_WIDTH - 4

  return (
    // "gray" is not in the core 0.1.7 palette and silently kills the render
    <box flexDirection="column" padding={1} border="round" borderColor="white" width={SIDEBAR_WIDTH} height={height}>
      <text height={1} width={innerWidth} bold dim>Groups ←/→</text>
      {groups.map((g) => (
        <text key={g} height={1} width={innerWidth} color={g === group ? 'cyan' : undefined} bold={g === group}>
          {g === group ? '▸ ' : '  '}{g}
        </text>
      ))}
    </box>
  )
}

function SecretList({ width, height }: PanelProps) {
  const vault = useTuiStore((s) => s.vault)
  const group = useTuiStore((s) => s.group)
  const mode = useTuiStore((s) => s.mode)
  const selected = useTuiStore((s) => s.selected)
  const filter = useTuiStore((s) => s.filter)
  const revealed = useTuiStore((s) => s.revealed)

  const secrets = vault ? visibleSecrets(filter, listSecrets(vault, group)) : []
  const innerWidth = width! - 4
  const valueCol = Math.max(10, innerWidth - NAME_COL - DATE_COL - 2)
  // Scroll window: keeps the selection visible when there are more rows
  // than vertical space.
  const maxRows = Math.max(1, height - 5)
  const start = Math.max(0, Math.min(selected - maxRows + 1, secrets.length - maxRows))
  const windowed = secrets.slice(start, start + maxRows)

  return (
    <box flexDirection="column" padding={1} border="round" borderColor="cyan" width={width} height={height}>
      <text height={1} width={innerWidth} bold color="cyan">
        Secrets · {group}{filter ? `  /${filter}` : ''}
      </text>
      {secrets.length === 0 ? (
        <text height={1} width={innerWidth} dim>
          {filter ? 'No matches.' : 'Empty. Press "a" to add.'}
        </text>
      ) : (
        windowed.map(([name, secret], offset) => {
          const index = start + offset
          const isSelected = index === selected
          const shown = revealed[name] ? secret.value : MASK
          const aliasBadge = secret.aliases?.length ? ` +${secret.aliases.length}` : ''
          return (
            <box key={name} flexDirection="row" gap={1} height={1} width={innerWidth}>
              <text height={1} width={NAME_COL} color={isSelected ? 'cyan' : undefined} bold={isSelected}>
                {isSelected ? '▸ ' : '  '}{name}{aliasBadge}
              </text>
              <text height={1} width={valueCol} dim={!revealed[name]}>{shown}</text>
              <text height={1} width={DATE_COL} dim>{secret.updatedAt.slice(0, 10)}</text>
            </box>
          )
        })
      )}
      {mode === 'browse' ? <BrowseKeymap count={secrets.length} names={secrets.map(([n]) => n)} /> : null}
      {mode === 'filter' ? <FilterInput width={innerWidth} /> : null}
      {mode === 'confirm-delete' ? <ConfirmDelete width={innerWidth} names={secrets.map(([n]) => n)} /> : null}
      {mode === 'new-group' ? <NewGroupInput width={innerWidth} /> : null}
    </box>
  )
}

// Browse-mode keymap. Lives in its own component so it is only active in
// "browse" mode (otherwise "a", "d" etc. would capture form typing). Actions
// read everything via getState(): keyboard handlers in 0.1.7 can hold on to
// closures from an old render.
function BrowseKeymap({ count, names }: { count: number; names: string[] }) {
  const clampedSelect = (offset: number) => {
    if (count === 0) return
    const s = useTuiStore.getState()
    s.setSelected((s.selected + offset + count) % count)
  }
  const switchGroup = (offset: number) => {
    const s = useTuiStore.getState()
    if (!s.vault) return
    const groups = listGroups(s.vault)
    const current = groups.indexOf(s.group)
    const next = groups[(current + offset + groups.length) % groups.length]
    if (next) s.setGroup(next)
  }
  const setMode = (mode: 'add' | 'edit' | 'confirm-delete' | 'filter' | 'new-group') =>
    useTuiStore.getState().setMode(mode)

  useKeymap([
    { key: 'up', action: () => clampedSelect(-1) },
    { key: 'down', action: () => clampedSelect(1) },
    { key: 'k', action: () => clampedSelect(-1) },
    { key: 'j', action: () => clampedSelect(1) },
    { key: 'left', action: () => switchGroup(-1) },
    { key: 'right', action: () => switchGroup(1) },
    { key: 'a', action: () => setMode('add') },
    { key: 'e', action: () => { if (count > 0) setMode('edit') } },
    { key: 'd', action: () => { if (count > 0) setMode('confirm-delete') } },
    {
      key: 'v',
      action: () => {
        const s = useTuiStore.getState()
        const name = names[s.selected]
        if (name) s.toggleReveal(name)
      },
    },
    { key: '/', action: () => setMode('filter') },
    { key: 'g', action: () => setMode('new-group') },
    { key: 'escape', action: () => useTuiStore.getState().setFilter('') },
    { key: 'q', action: () => process.exit(0) },
    { key: 'c', ctrl: true, action: () => process.exit(0) },
  ])
  return null
}

function FilterInput({ width }: { width: number }) {
  const filter = useTuiStore((s) => s.filter)

  useInput((key: string, event: KeyEvent) => {
    const s = useTuiStore.getState()
    if (key === 'escape' || key === 'esc') {
      s.setFilter('')
      s.setMode('browse')
      return
    }
    if (key === 'enter' || key === 'return') {
      s.setMode('browse')
      return
    }
    if (key === 'backspace') {
      s.setFilter(s.filter.slice(0, -1))
      return
    }
    if (key.length === 1 && !event.ctrl && !event.alt) s.setFilter(s.filter + key)
  })

  return <text height={1} width={width} color="yellow">search: {filter}▏ (Enter keeps, Esc clears)</text>
}

function ConfirmDelete({ width, names }: { width: number; names: string[] }) {
  const selected = useTuiStore((s) => s.selected)
  const name = names[selected]

  useKeymap([
    {
      key: 'y',
      action: () => {
        const s = useTuiStore.getState()
        const target = names[s.selected]
        if (s.vault && target) {
          removeSecret(s.vault, s.group, target)
          saveVault(s.vault)
          s.setStatus(`✓ ${target} removed`)
          s.setSelected(Math.max(0, s.selected - 1))
        }
        s.setMode('browse')
      },
    },
    { key: 'n', action: () => useTuiStore.getState().setMode('browse') },
    { key: 'escape', action: () => useTuiStore.getState().setMode('browse') },
  ])

  return <text height={1} width={width} color="red">Remove {name}? [y/n]</text>
}

function NewGroupInput({ width }: { width: number }) {
  const [name, setName] = useState('')
  const nameRef = useRef('')
  nameRef.current = name

  useInput((key: string, event: KeyEvent) => {
    const s = useTuiStore.getState()
    if (key === 'escape' || key === 'esc') {
      s.setMode('browse')
      return
    }
    if (key === 'enter' || key === 'return') {
      const trimmed = nameRef.current.trim()
      if (s.vault && trimmed) {
        s.vault.data.groups[trimmed] ??= {}
        saveVault(s.vault)
        s.setGroup(trimmed)
        s.setStatus(`✓ group "${trimmed}" created`)
      }
      s.setMode('browse')
      return
    }
    if (key === 'backspace') {
      setName((n: string) => n.slice(0, -1))
      return
    }
    if (key.length === 1 && !event.ctrl && !event.alt) setName((n: string) => n + key)
  })

  return <text height={1} width={width} color="yellow">new group: {name}▏ (Enter creates, Esc cancels)</text>
}

function Footer({ width }: { width?: number }) {
  const status = useTuiStore((s) => s.status)
  return (
    <box flexDirection="column" height={2} width={width}>
      <text height={1} width={width} color="green">{status || ' '}</text>
      <text height={1} width={width} dim>
        ↑↓ move · ←→ group · a add · e edit · d delete · v reveal · / search · g new group · q quit
      </text>
    </box>
  )
}
