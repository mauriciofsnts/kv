import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import type { EnvFileGateway } from '../../application/ports.ts'

export const fsEnvFiles: EnvFileGateway = {
  exists: (path) => existsSync(path),
  read: (path) => readFileSync(path, 'utf8'),
  write: (path, content) => writeFileSync(path, content),
}
