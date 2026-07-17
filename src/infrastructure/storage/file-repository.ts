import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { EncryptedEnvelope, VaultRepository } from '../../application/ports.ts'
import { VaultNotFoundError } from '../../domain/errors.ts'

export class FileRepository implements VaultRepository {
  readonly kind = 'file'
  constructor(readonly location: string) {}

  async exists(): Promise<boolean> {
    return existsSync(this.location)
  }

  async read(): Promise<EncryptedEnvelope> {
    if (!existsSync(this.location)) throw new VaultNotFoundError(this.location)
    return JSON.parse(readFileSync(this.location, 'utf8')) as EncryptedEnvelope
  }

  // Atomic write: .tmp + rename, keeping the previous version as .bak.
  async write(envelope: EncryptedEnvelope): Promise<void> {
    const serialized = JSON.stringify(envelope, null, 2) + '\n'
    mkdirSync(dirname(this.location), { recursive: true, mode: 0o700 })
    if (existsSync(this.location)) copyFileSync(this.location, this.location + '.bak')
    const tmp = this.location + '.tmp'
    writeFileSync(tmp, serialized, { mode: 0o600 })
    renameSync(tmp, this.location)
  }
}
