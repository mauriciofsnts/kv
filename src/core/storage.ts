// Vault storage backends. The vault location decides where the encrypted
// envelope lives: a plain path keeps the current file behavior, while a
// database URL (sqlite://, postgres://, mysql://, mariadb://) stores it in a
// single-row table. Every backend only ever sees ciphertext — encryption
// stays client-side.
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { EncryptedEnvelope } from './crypto.ts'

export class VaultNotFoundError extends Error {
  constructor(location: string) {
    super(`Vault not found at ${location}. Run \`key init\` to create one.`)
    this.name = 'VaultNotFoundError'
  }
}

export class VaultExistsError extends Error {
  constructor(location: string) {
    super(`A vault already exists at ${location}.`)
    this.name = 'VaultExistsError'
  }
}

export interface VaultStorage {
  location: string
  kind: 'file' | 'database'
  exists(): Promise<boolean>
  read(): Promise<EncryptedEnvelope>
  write(envelope: EncryptedEnvelope): Promise<void>
}

const DB_SCHEMES = /^(sqlite|postgres|postgresql|mysql|mariadb):\/\//

export function storageFor(location: string): VaultStorage {
  return DB_SCHEMES.test(location) ? new SqlStorage(location) : new FileStorage(location)
}

class FileStorage implements VaultStorage {
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

// Single-row table via Bun.SQL, which speaks sqlite/postgres/mysql/mariadb
// with the same API. The `previous` column plays the role of the .bak file.
class SqlStorage implements VaultStorage {
  readonly kind = 'database'
  constructor(readonly location: string) {}

  private async connect() {
    // sqlite:// paths may point into a directory that doesn't exist yet.
    const sqliteFile = this.location.match(/^sqlite:\/\/(.+)$/)?.[1]
    if (sqliteFile && sqliteFile !== ':memory:') {
      mkdirSync(dirname(sqliteFile), { recursive: true, mode: 0o700 })
    }
    const { SQL } = await import('bun')
    const sql = new SQL(this.location)
    await sql`CREATE TABLE IF NOT EXISTS key_vault (
      id INTEGER PRIMARY KEY,
      envelope TEXT NOT NULL,
      previous TEXT,
      updated_at TEXT NOT NULL
    )`
    return sql
  }

  async exists(): Promise<boolean> {
    const sql = await this.connect()
    try {
      const rows = await sql`SELECT id FROM key_vault WHERE id = 1`
      return rows.length > 0
    } finally {
      await sql.end()
    }
  }

  async read(): Promise<EncryptedEnvelope> {
    const sql = await this.connect()
    try {
      const rows = await sql`SELECT envelope FROM key_vault WHERE id = 1`
      if (rows.length === 0) throw new VaultNotFoundError(this.location)
      return JSON.parse(rows[0].envelope as string) as EncryptedEnvelope
    } finally {
      await sql.end()
    }
  }

  async write(envelope: EncryptedEnvelope): Promise<void> {
    const serialized = JSON.stringify(envelope)
    const now = new Date().toISOString()
    const sql = await this.connect()
    try {
      // SELECT + UPDATE/INSERT instead of upsert: the syntax is portable
      // across every dialect Bun.SQL speaks.
      const rows = await sql`SELECT envelope FROM key_vault WHERE id = 1`
      if (rows.length > 0) {
        const previous = rows[0].envelope as string
        await sql`UPDATE key_vault
          SET envelope = ${serialized}, previous = ${previous}, updated_at = ${now}
          WHERE id = 1`
      } else {
        await sql`INSERT INTO key_vault (id, envelope, previous, updated_at)
          VALUES (1, ${serialized}, NULL, ${now})`
      }
    } finally {
      await sql.end()
    }
  }
}
