// Command-line prompts with no TUI dependency: the CLI must work in
// pipes and scripts, where spinning up a TUI app makes no sense.

import { uiErr } from './ui.ts'

export async function hiddenPrompt(label: string): Promise<string> {
  process.stderr.write(uiErr.cyan('? ') + uiErr.bold(label))
  const stdin = process.stdin
  if (!stdin.isTTY) {
    const line = await readLine()
    process.stderr.write('\n')
    return line
  }
  stdin.setRawMode(true)
  stdin.resume()
  return new Promise((resolve, reject) => {
    const bytes: number[] = []
    const onData = (chunk: Buffer) => {
      for (const byte of chunk) {
        if (byte === 0x03) {
          cleanup()
          reject(new Error('canceled'))
          return
        }
        if (byte === 0x0d || byte === 0x0a) {
          cleanup()
          process.stderr.write('\n')
          resolve(Buffer.from(bytes).toString('utf8'))
          return
        }
        if (byte === 0x7f || byte === 0x08) {
          // Drop the last full UTF-8 codepoint (continuation bytes 0b10xxxxxx).
          while (bytes.length > 0 && (bytes[bytes.length - 1]! & 0xc0) === 0x80) bytes.pop()
          bytes.pop()
          continue
        }
        bytes.push(byte)
      }
    }
    const cleanup = () => {
      stdin.off('data', onData)
      stdin.setRawMode(false)
      stdin.pause()
    }
    stdin.on('data', onData)
  })
}

export async function confirmPrompt(label: string): Promise<boolean> {
  process.stderr.write(`${uiErr.cyan('? ')}${uiErr.bold(label)} ${uiErr.dim('[y/N]')} `)
  const answer = (await readLine()).trim().toLowerCase()
  return answer === 'y' || answer === 'yes'
}

// Reads a line from process.stdin directly. The `console` async iterator
// locks stdin's ReadableStream in Bun, which breaks any later prompt in the
// same run (e.g. a confirm right after the password prompt). Input beyond the
// first newline (piped stdin arrives in one chunk) is kept for the next call.
let pending = ''

export async function readLine(): Promise<string> {
  const newlineInPending = pending.indexOf('\n')
  if (newlineInPending !== -1) {
    const line = pending.slice(0, newlineInPending)
    pending = pending.slice(newlineInPending + 1)
    return line.endsWith('\r') ? line.slice(0, -1) : line
  }
  const stdin = process.stdin
  stdin.resume()
  return new Promise((resolve) => {
    const finish = (line: string) => {
      stdin.off('data', onData)
      stdin.off('end', onEnd)
      stdin.pause()
      resolve(line.endsWith('\r') ? line.slice(0, -1) : line)
    }
    const onData = (chunk: Buffer) => {
      pending += chunk.toString('utf8')
      const newline = pending.indexOf('\n')
      if (newline !== -1) {
        const line = pending.slice(0, newline)
        pending = pending.slice(newline + 1)
        finish(line)
      }
    }
    const onEnd = () => {
      const line = pending
      pending = ''
      finish(line)
    }
    stdin.on('data', onData)
    stdin.on('end', onEnd)
  })
}
