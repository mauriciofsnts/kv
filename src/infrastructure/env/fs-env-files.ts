import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import type { EnvFileGateway } from '../../application/ports.ts'

export const fsEnvFiles: EnvFileGateway = {
  exists: (path) => existsSync(path),
  read: (path) => readFileSync(path, 'utf8'),
  // 0600 only takes effect when the file is created (e.g. a template
  // target): the plaintext secrets should not be world-readable. Existing
  // files keep whatever mode the user gave them.
  write: (path, content) => writeFileSync(path, content, { mode: 0o600 }),
}
