// Command-line prompts with no TUI dependency: the CLI must work in
// pipes and scripts, where spinning up a TUI app makes no sense.

export async function hiddenPrompt(label: string): Promise<string> {
  process.stderr.write(label)
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
  process.stderr.write(`${label} [y/N] `)
  const answer = (await readLine()).trim().toLowerCase()
  return answer === 'y' || answer === 'yes'
}

async function readLine(): Promise<string> {
  for await (const line of console) return line
  return ''
}
