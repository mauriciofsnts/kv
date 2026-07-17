// Ports: interfaces the use cases depend on. Implementations live in
// src/infrastructure/ and are wired together in src/composition.ts.

export interface KdfParams {
  algo: 'scrypt'
  salt: string
  N: number
  r: number
  p: number
}

export interface EncryptedEnvelope {
  version: 1
  kdf: KdfParams
  cipher: { algo: 'aes-256-gcm'; iv: string; tag: string }
  data: string
}

export interface CryptoProvider {
  newKdfParams(): KdfParams
  deriveKey(password: string, kdf: KdfParams): Buffer
  encrypt(plaintext: string, key: Buffer, kdf: KdfParams): EncryptedEnvelope
  // Throws WrongPasswordError when authentication fails.
  decrypt(envelope: EncryptedEnvelope, key: Buffer): string
  randomBytes(length: number): Buffer
}

// Where the encrypted envelope lives (file, database row, ...). Backends
// only ever see ciphertext.
export interface VaultRepository {
  location: string
  kind: 'file' | 'database'
  exists(): Promise<boolean>
  // Throws VaultNotFoundError when there is no vault at the location.
  read(): Promise<EncryptedEnvelope>
  write(envelope: EncryptedEnvelope): Promise<void>
}

export type RepositoryFactory = (location: string) => VaultRepository

export interface SessionCache {
  store(key: Buffer): { volatile: boolean }
  load(): Buffer | null
  clear(): void
}

export interface ConfigStore {
  // Resolved vault location: env override > persisted config > default file.
  vaultLocation(): string
  setVaultLocation(location: string): void
  // True when an env var overrides the persisted location.
  locationOverridden(): boolean
  minPasswordLength(): number
}

export interface EnvFileGateway {
  exists(path: string): boolean
  read(path: string): string
  write(path: string, content: string): void
}
