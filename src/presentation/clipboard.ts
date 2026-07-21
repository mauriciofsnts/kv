// Clipboard helper shared by CLI (`kv get --copy`) and TUI (the `c` key).
// Uses the session's native tool; the value travels via stdin/env, never
// through argv (which would leak into `ps`).

interface ClipboardTool {
  name: string
  copy: string[]
  // Builds the command that clears the clipboard after `delaySeconds`,
  // iff it still holds $KV_CLIP_VALUE (never wipes a value copied meanwhile).
  clearCommand: (delaySeconds: number) => string[]
}

// PowerShell reads piped stdin using the console's input encoding, which is
// not UTF-8 by default — force it so non-ASCII secret values survive.
const PS_COPY = [
  '[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)',
  '$v = [Console]::In.ReadToEnd()',
  'Set-Clipboard -Value $v',
].join('; ')

function pickTool(): ClipboardTool | null {
  if (process.platform === 'win32') {
    if (!Bun.which('powershell.exe') && !Bun.which('powershell')) return null
    return {
      name: 'powershell',
      copy: ['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', PS_COPY],
      clearCommand: (delaySeconds) => [
        'powershell.exe',
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Start-Sleep -Seconds ${delaySeconds}; if ((Get-Clipboard -Raw) -eq $env:KV_CLIP_VALUE) { Set-Clipboard -Value $null }`,
      ],
    }
  }
  if (process.env.WAYLAND_DISPLAY && Bun.which('wl-copy')) {
    return {
      name: 'wl-copy',
      copy: ['wl-copy'],
      clearCommand: (delaySeconds) => [
        'sh',
        '-c',
        `sleep ${delaySeconds}; [ "$(wl-paste 2>/dev/null)" = "$KV_CLIP_VALUE" ] && wl-copy --clear`,
      ],
    }
  }
  if (Bun.which('xclip')) {
    return {
      name: 'xclip',
      copy: ['xclip', '-selection', 'clipboard'],
      clearCommand: (delaySeconds) => [
        'sh',
        '-c',
        `sleep ${delaySeconds}; [ "$(xclip -o -selection clipboard 2>/dev/null)" = "$KV_CLIP_VALUE" ] && printf "" | xclip -selection clipboard`,
      ],
    }
  }
  if (Bun.which('xsel')) {
    return {
      name: 'xsel',
      copy: ['xsel', '--input', '--clipboard'],
      clearCommand: (delaySeconds) => [
        'sh',
        '-c',
        `sleep ${delaySeconds}; [ "$(xsel --output --clipboard 2>/dev/null)" = "$KV_CLIP_VALUE" ] && xsel --clear --clipboard`,
      ],
    }
  }
  return null
}

export const CLIPBOARD_CLEAR_SECONDS = 30

// Copies and schedules an auto-clear; resolves with the tool name.
export async function copyToClipboard(value: string): Promise<string> {
  const tool = pickTool()
  if (!tool) {
    throw new Error(
      process.platform === 'win32'
        ? 'No clipboard tool found (powershell.exe is required).'
        : 'No clipboard tool found (install wl-clipboard, xclip or xsel).',
    )
  }
  const proc = Bun.spawn(tool.copy, { stdin: 'pipe', stdout: 'ignore', stderr: 'ignore' })
  proc.stdin.write(value)
  await proc.stdin.end()
  if ((await proc.exited) !== 0) {
    throw new Error(`${tool.name} failed to copy.`)
  }

  // Detached process that clears the clipboard later.
  const clearer = Bun.spawn(tool.clearCommand(CLIPBOARD_CLEAR_SECONDS), {
    env: { ...process.env, KV_CLIP_VALUE: value },
    stdin: 'ignore',
    stdout: 'ignore',
    stderr: 'ignore',
  })
  clearer.unref()
  return tool.name
}
