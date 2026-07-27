import { create } from 'zustand'
import type { Vault } from '../../application/vault.ts'

export type Mode =
  | 'unlock'
  | 'browse'
  | 'filter'
  | 'add'
  | 'edit'
  | 'confirm-delete'
  | 'new-group'
  | 'move'

export type StatusVariant = 'success' | 'error'

interface TuiState {
  vault: Vault | null
  group: string
  mode: Mode
  selected: number
  filter: string
  revealed: Record<string, boolean>
  status: string
  statusVariant: StatusVariant
  // Secret being turned into an alias while mode === 'move'.
  moveSource: string | null

  setVault: (vault: Vault) => void
  setGroup: (group: string) => void
  setMode: (mode: Mode) => void
  setMoveSource: (name: string | null) => void
  setSelected: (index: number) => void
  setFilter: (filter: string) => void
  toggleReveal: (name: string) => void
  setStatus: (status: string, variant?: StatusVariant) => void
}

export const useTuiStore = create<TuiState>()((set) => ({
  vault: null,
  group: 'default',
  mode: 'unlock',
  selected: 0,
  filter: '',
  revealed: {},
  status: '',
  statusVariant: 'success',
  moveSource: null,

  setVault: (vault) => set({ vault, mode: 'browse' }),
  setGroup: (group) => set({ group, selected: 0, filter: '', revealed: {} }),
  setMode: (mode) => set({ mode }),
  setMoveSource: (moveSource) => set({ moveSource }),
  setSelected: (selected) => set({ selected }),
  setFilter: (filter) => set({ filter, selected: 0 }),
  toggleReveal: (name) =>
    set((s) => ({ revealed: { ...s.revealed, [name]: !s.revealed[name] } })),
  setStatus: (status, variant = 'success') => set({ status, statusVariant: variant }),
}))
