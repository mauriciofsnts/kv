import type { RepositoryFactory } from '../../application/ports.ts'
import { FileRepository } from './file-repository.ts'
import { SqlRepository } from './sql-repository.ts'

const DB_SCHEMES = /^(sqlite|postgres|postgresql|mysql|mariadb):\/\//

// A plain path means the file backend; a database URL means Bun.SQL.
export const repositoryFor: RepositoryFactory = (location: string) =>
  DB_SCHEMES.test(location) ? new SqlRepository(location) : new FileRepository(location)
