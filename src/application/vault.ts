import type { VaultData } from '../domain/secret.ts'
import type { KdfParams, VaultRepository } from './ports.ts'

// An unlocked vault: decrypted data plus everything needed to persist it.
export interface Vault {
  data: VaultData
  key: Buffer
  kdf: KdfParams
  repository: VaultRepository
}
