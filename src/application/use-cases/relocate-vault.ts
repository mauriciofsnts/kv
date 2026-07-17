// The `key vault` flow: inspect or change where the vault is stored,
// optionally copying the (encrypted) envelope to the new location.
import type { ConfigStore, RepositoryFactory } from '../ports.ts'

export function makeRelocateVault(config: ConfigStore, repositoryFor: RepositoryFactory) {
  return {
    async status() {
      const location = config.vaultLocation()
      const repository = repositoryFor(location)
      return {
        location,
        kind: repository.kind,
        exists: await repository.exists(),
        overridden: config.locationOverridden(),
      }
    },

    async inspectTarget(location: string) {
      const current = repositoryFor(config.vaultLocation())
      const target = repositoryFor(location)
      return {
        currentLocation: current.location,
        targetKind: target.kind,
        sameLocation: current.location === target.location,
        currentExists: await current.exists(),
        targetExists: await target.exists(),
      }
    },

    // Copies ciphertext only — no password involved.
    async copyVault(toLocation: string): Promise<void> {
      const current = repositoryFor(config.vaultLocation())
      const target = repositoryFor(toLocation)
      await target.write(await current.read())
    },

    setLocation(location: string): void {
      config.setVaultLocation(location)
    },
  }
}

export type RelocateVault = ReturnType<typeof makeRelocateVault>
