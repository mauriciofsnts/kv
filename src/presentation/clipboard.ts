// Clipboard helper shared by CLI (`key get --copy`) and TUI (the `c` key).
// Uses the session's native tool; the value travels via stdin/env, never
// through argv (which would leak into `ps`).

interface ClipboardTool {
  name: string
  copy: string[]
  // Shell script that clears the clipboard iff it still holds $KEY_CLIP_VALUE.
  clearScript: string
}

function pickTool(): ClipboardTool | null {
  if (process.env.WAYLAND_DISPLAY && Bun.which('wl-copy')) {
    return {
      name: 'wl-copy',
      copy: ['wl-copy'],
      clearScript: '[ "$(wl-paste 2>/dev/null)" = "$KEY_CLIP_VALUE" ] && wl-copy --clear',
    }
  }
  if (Bun.which('xclip')) {
    return {
      name: 'xclip',
      copy: ['xclip', '-selection', 'clipboard'],
      clearScript:
        '[ "$(xclip -o -selection clipboard 2>/dev/null)" = "$KEY_CLIP_VALUE" ] && printf "" | xclip -selection clipboard',
    }
  }
  if (Bun.which('xsel')) {
    return {
      name: 'xsel',
      copy: ['xsel', '--input', '--clipboard'],
      clearScript:
        '[ "$(xsel --output --clipboard 2>/dev/null)" = "$KEY_CLIP_VALUE" ] && xsel --clear --clipboard',
    }
  }
  return null
}

export const CLIPBOARD_CLEAR_SECONDS = 30

// Copies and schedules an auto-clear; resolves with the tool name.
export async function copyToClipboard(value: string): Promise<string> {
  const tool = pickTool()
  if (!tool) {
    throw new Error('No clipboard tool found (install wl-clipboard, xclip or xsel).')
  }
  const proc = Bun.spawn(tool.copy, { stdin: 'pipe', stdout: 'ignore', stderr: 'ignore' })
  proc.stdin.write(value)
  await proc.stdin.end()
  if ((await proc.exited) !== 0) {
    throw new Error(`${tool.name} failed to copy.`)
  }

  // Detached sh that clears the clipboard later — only if it still holds
  // this value, so it never wipes something the user copied meanwhile.
  const clearer = Bun.spawn(
    ['sh', '-c', `sleep ${CLIPBOARD_CLEAR_SECONDS}; ${tool.clearScript}`],
    {
      env: { ...process.env, KEY_CLIP_VALUE: value },
      stdin: 'ignore',
      stdout: 'ignore',
      stderr: 'ignore',
    },
  )
  clearer.unref()
  return tool.name
}
