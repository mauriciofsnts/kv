// Composition root: the only place where infrastructure implementations
// are bound to application ports. Presentation (CLI/TUI) imports the wired
// use cases from here and never touches infrastructure directly.
import { makeApplyEnv } from './application/use-cases/apply-env.ts'
import { makeManageSecrets } from './application/use-cases/manage-secrets.ts'
import { makeRelocateVault } from './application/use-cases/relocate-vault.ts'
import { makeVaultAccess } from './application/use-cases/vault-access.ts'
import { jsonConfigStore } from './infrastructure/config/json-config-store.ts'
import { nodeCrypto } from './infrastructure/crypto/node-crypto.ts'
import { fsEnvFiles } from './infrastructure/env/fs-env-files.ts'
import { fileSessionCache } from './infrastructure/session/file-session-cache.ts'
import { repositoryFor } from './infrastructure/storage/repository-factory.ts'

export const config = jsonConfigStore

export const vaultAccess = makeVaultAccess({
  crypto: nodeCrypto,
  sessions: fileSessionCache,
  config: jsonConfigStore,
  repositoryFor,
})

export const manageSecrets = makeManageSecrets(vaultAccess)

export const applyEnv = makeApplyEnv(fsEnvFiles)

export const relocateVault = makeRelocateVault(jsonConfigStore, repositoryFor)
