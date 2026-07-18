// Opening, creating and persisting vaults.
import { emptyVaultData } from '../../domain/secret.ts'
import { VaultExistsError } from '../../domain/errors.ts'
import type {
  ConfigStore,
  CryptoProvider,
  RepositoryFactory,
  SessionCache,
  VaultRepository,
} from '../ports.ts'
import type { Vault } from '../vault.ts'

export interface VaultAccessDeps {
  crypto: CryptoProvider
  sessions: SessionCache
  config: ConfigStore
  repositoryFor: RepositoryFactory
}

export function makeVaultAccess({ crypto, sessions, config, repositoryFor }: VaultAccessDeps) {
  const resolve = (location?: string): VaultRepository =>
    repositoryFor(location ?? config.vaultLocation())

  async function open(repository: VaultRepository, key: Buffer): Promise<Vault> {
    const envelope = await repository.read()
    const data = JSON.parse(crypto.decrypt(envelope, key))
    return { data, key, kdf: envelope.kdf, repository }
  }

  return {
    exists(location?: string): Promise<boolean> {
      return resolve(location).exists()
    },

    async initVault(password: string, location?: string): Promise<Vault> {
      const minLength = config.minPasswordLength()
      if (password.length < minLength) {
        throw new Error(
          `Password must be at least ${minLength} characters (KEY_MIN_PASSWORD_LENGTH).`,
        )
      }
      const repository = resolve(location)
      if (await repository.exists()) throw new VaultExistsError(repository.location)
      const kdf = crypto.newKdfParams()
      const vault: Vault = {
        data: emptyVaultData(),
        key: crypto.deriveKey(password, kdf),
        kdf,
        repository,
      }
      await saveVault(vault)
      sessions.store(vault.key)
      return vault
    },

    // Throws WrongPasswordError (from CryptoProvider.decrypt) on bad password.
    async openWithPassword(password: string, location?: string): Promise<Vault> {
      const repository = resolve(location)
      const envelope = await repository.read()
      const key = crypto.deriveKey(password, envelope.kdf)
      const data = JSON.parse(crypto.decrypt(envelope, key))
      return { data, key, kdf: envelope.kdf, repository }
    },

    // Returns null when there is no (valid) session for this vault.
    async openWithSession(location?: string): Promise<Vault | null> {
      const key = sessions.load()
      if (!key) return null
      return open(resolve(location), key)
    },

    startSession(vault: Vault): { volatile: boolean } {
      return sessions.store(vault.key)
    },

    lock(): void {
      sessions.clear()
    },

    async changePassword(vault: Vault, newPassword: string): Promise<Vault> {
      const minLength = config.minPasswordLength()
      if (newPassword.length < minLength) {
        throw new Error(
          `Password must be at least ${minLength} characters (KEY_MIN_PASSWORD_LENGTH).`,
        )
      }
      const kdf = crypto.newKdfParams()
      const rekeyed: Vault = { ...vault, key: crypto.deriveKey(newPassword, kdf), kdf }
      // Save twice: repositories keep the previous version as a backup
      // (.bak file / `previous` column), and a single save would leave that
      // backup encrypted under the old password — defeating the point of
      // changing it. The second save makes the backup a new-key envelope.
      await saveVault(rekeyed)
      await saveVault(rekeyed)
      sessions.clear()
      return rekeyed
    },

    saveVault,
  }

  async function saveVault(vault: Vault): Promise<void> {
    const envelope = crypto.encrypt(JSON.stringify(vault.data), vault.key, vault.kdf)
    await vault.repository.write(envelope)
  }
}

export type VaultAccess = ReturnType<typeof makeVaultAccess>
