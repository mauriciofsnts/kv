// Single-row table via Bun.SQL, which speaks sqlite/postgres/mysql/mariadb
// with the same API. The `previous` column plays the role of the .bak file.
// Only ciphertext ever reaches the database — encryption stays client-side.
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { EncryptedEnvelope, VaultRepository } from '../../application/ports.ts'
import { VaultNotFoundError } from '../../domain/errors.ts'

export class SqlRepository implements VaultRepository {
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
