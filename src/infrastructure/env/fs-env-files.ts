import { existsSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from 'node:fs'
import type { EnvFileGateway } from '../../application/ports.ts'

export const fsEnvFiles: EnvFileGateway = {
  exists: (path) => existsSync(path),
  read: (path) => readFileSync(path, 'utf8'),
  // Atomic tmp+rename so a crash mid-apply can't leave a truncated .env.
  // Symlinks are resolved first so the rename replaces the real file, not
  // the link. The tmp inherits an existing file's mode; new files get 0600
  // (the plaintext secrets should not be world-readable).
  write(path, content) {
    const target = existsSync(path) ? realpathSync(path) : path
    const mode = existsSync(target) ? statSync(target).mode & 0o777 : 0o600
    const tmp = target + '.tmp'
    writeFileSync(tmp, content, { mode })
    renameSync(tmp, target)
  },
}
