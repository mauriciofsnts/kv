import { renameSync } from 'node:fs'

// Windows can reject a rename onto an existing file with EPERM/EBUSY when
// the destination is locked (an editor has it open, AV is scanning it, a
// previous process didn't release its handle) — far more common there than
// on Linux/macOS. Retry briefly instead of crashing the whole operation.
const RETRY_ATTEMPTS = 5
const RETRY_DELAY_MS = 50

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

export function renameWithRetry(src: string, dest: string): void {
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      renameSync(src, dest)
      return
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      const retryable = code === 'EPERM' || code === 'EBUSY' || code === 'EACCES'
      if (!retryable || attempt === RETRY_ATTEMPTS) {
        if (retryable) {
          throw new Error(
            `Could not write to "${dest}": the file appears to be locked by another program (${code}). Close any program using it and try again.`,
          )
        }
        throw err
      }
      sleepSync(RETRY_DELAY_MS)
    }
  }
}
