import { createStore } from '@termuijs/store'
import type { Vault } from '../core/vault.ts'

export type Mode = 'unlock' | 'browse' | 'filter' | 'add' | 'edit' | 'confirm-delete' | 'new-group'

interface TuiState {
  vault: Vault | null
  group: string
  mode: Mode
  selected: number
  filter: string
  revealed: Record<string, boolean>
  status: string

  setVault: (vault: Vault) => void
  setGroup: (group: string) => void
  setMode: (mode: Mode) => void
  setSelected: (index: number) => void
  setFilter: (filter: string) => void
  toggleReveal: (name: string) => void
  setStatus: (status: string) => void
}

export const useTuiStore = createStore<TuiState>((set) => ({
  vault: null,
  group: 'default',
  mode: 'unlock',
  selected: 0,
  filter: '',
  revealed: {},
  status: '',

  setVault: (vault) => set({ vault, mode: 'browse' }),
  setGroup: (group) => set({ group, selected: 0, filter: '', revealed: {} }),
  setMode: (mode) => set({ mode }),
  setSelected: (selected) => set({ selected }),
  setFilter: (filter) => set({ filter, selected: 0 }),
  toggleReveal: (name) =>
    set((s) => ({ revealed: { ...s.revealed, [name]: !s.revealed[name] } })),
  setStatus: (status) => set({ status }),
}))
