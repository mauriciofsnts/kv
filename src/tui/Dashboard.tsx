/** @jsxImportSource @termuijs/jsx */
// NOTA sobre dimensões: o layout do @termuijs 0.1.7 não mede conteúdo no
// eixo principal (flexGrow/auto viram 0 e o widget some). Por isso todo
// box/text daqui leva width/height explícitos, calculados de useTerminalSize.
import type { KeyEvent } from '@termuijs/core'
import { useInput, useKeymap, useRef, useState } from '@termuijs/jsx'
import { useTermSize } from './useTermSize.ts'
import {
  type Secret,
  listGroups,
  listSecrets,
  removeSecret,
  saveVault,
} from '../core/vault.ts'
import { SecretForm } from './SecretForm.tsx'
import { useTuiStore } from './store.ts'

const MASK = '••••••••'
const SIDEBAR_WIDTH = 24
const NAME_COL = 28
const DATE_COL = 10

function visibleSecrets(filter: string, secrets: [string, Secret][]): [string, Secret][] {
  if (!filter) return secrets
  const needle = filter.toLowerCase()
  return secrets.filter(([name]) => name.toLowerCase().includes(needle))
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
    // "gray" não existe na paleta do core 0.1.7 e derruba o render inteiro
    <box flexDirection="column" padding={1} border="round" borderColor="white" width={SIDEBAR_WIDTH} height={height}>
      <text height={1} width={innerWidth} bold dim>Grupos ←/→</text>
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
  // Janela de rolagem: mantém a seleção visível quando há mais linhas que espaço.
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
          {filter ? 'Nada encontrado.' : 'Vazio. Pressione "a" para adicionar.'}
        </text>
      ) : (
        windowed.map(([name, secret], offset) => {
          const index = start + offset
          const isSelected = index === selected
          const shown = revealed[name] ? secret.value : MASK
          return (
            <box key={name} flexDirection="row" gap={1} height={1} width={innerWidth}>
              <text height={1} width={NAME_COL} color={isSelected ? 'cyan' : undefined} bold={isSelected}>
                {isSelected ? '▸ ' : '  '}{name}
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

// Keymap do modo navegação. Vive num componente próprio para só estar
// ativo quando o modo é "browse" (senão "a", "d" etc. capturariam a
// digitação dos formulários). As actions leem tudo via getState(): os
// handlers de teclado do 0.1.7 podem guardar closure de um render antigo.
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

  return <text height={1} width={width} color="yellow">busca: {filter}▏ (Enter mantém, Esc limpa)</text>
}

function ConfirmDelete({ width, names }: { width: number; names: string[] }) {
  const selected = useTuiStore((s) => s.selected)
  const name = names[selected]

  useKeymap([
    {
      key: 's',
      action: () => {
        const s = useTuiStore.getState()
        const target = names[s.selected]
        if (s.vault && target) {
          removeSecret(s.vault, s.group, target)
          saveVault(s.vault)
          s.setStatus(`✓ ${target} removida`)
          s.setSelected(Math.max(0, s.selected - 1))
        }
        s.setMode('browse')
      },
    },
    { key: 'n', action: () => useTuiStore.getState().setMode('browse') },
    { key: 'escape', action: () => useTuiStore.getState().setMode('browse') },
  ])

  return <text height={1} width={width} color="red">Remover {name}? [s/n]</text>
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
        s.setStatus(`✓ grupo "${trimmed}" criado`)
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

  return <text height={1} width={width} color="yellow">novo grupo: {name}▏ (Enter cria, Esc cancela)</text>
}

function Footer({ width }: { width?: number }) {
  const status = useTuiStore((s) => s.status)
  return (
    <box flexDirection="column" height={2} width={width}>
      <text height={1} width={width} color="green">{status || ' '}</text>
      <text height={1} width={width} dim>
        ↑↓ navega · ←→ grupo · a add · e edita · d remove · v revela · / busca · g grupo novo · q sai
      </text>
    </box>
  )
}
