// Java .properties parser/patcher, line-preserving like domain/env-file.ts:
// comments, order and CRLF survive edits. Backslash line continuations are
// not supported — a continued value is left untouched by setValue/appendVar
// treats the key as absent (same as any other unmatched line).
const KEY_LINE = /^(\s*)([^\s:=#!\\][^:=]*?)(\s*[:=]\s*)(.*)$/

export interface VarEntry {
  name: string
  lineIndex: number
}

export function listVars(content: string): VarEntry[] {
  const seen = new Set<string>()
  const entries: VarEntry[] = []
  splitLines(content).forEach((line, lineIndex) => {
    if (isComment(line.text)) return
    const match = line.text.match(KEY_LINE)
    if (match && !seen.has(match[2]!)) {
      seen.add(match[2]!)
      entries.push({ name: match[2]!, lineIndex })
    }
  })
  return entries
}

export interface Entry {
  name: string
  value: string
}

export function parseEntries(content: string): Entry[] {
  const byName = new Map<string, string>()
  for (const line of splitLines(content)) {
    if (isComment(line.text)) continue
    const match = line.text.match(KEY_LINE)
    if (match) byName.set(match[2]!, unescapeValue(match[4]!))
  }
  return [...byName.entries()].map(([name, value]) => ({ name, value }))
}

export interface SetValueResult {
  content: string
  found: boolean
}

export function setValue(content: string, name: string, value: string): SetValueResult {
  const lines = splitLines(content)
  let found = false
  for (const line of lines) {
    if (isComment(line.text)) continue
    const match = line.text.match(KEY_LINE)
    if (match && match[2] === name) {
      found = true
      line.text = `${match[1]}${match[2]}${match[3]}${escapeValue(value)}`
    }
  }
  return { content: joinLines(lines), found }
}

export function appendVar(content: string, name: string, value: string): string {
  const eol = content.includes('\r\n') ? '\r\n' : '\n'
  const needsNewline = content.length > 0 && !content.endsWith('\n')
  return `${content}${needsNewline ? eol : ''}${name}=${escapeValue(value)}${eol}`
}

function isComment(text: string): boolean {
  const trimmed = text.trimStart()
  return trimmed.startsWith('#') || trimmed.startsWith('!')
}

// Reverses escapeValue plus the common java.util.Properties escapes a
// hand-written file may already use.
function unescapeValue(raw: string): string {
  let out = ''
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]
    if (c !== '\\' || i === raw.length - 1) {
      out += c
      continue
    }
    const next = raw[i + 1]!
    if (next === 'u') {
      const hex = raw.slice(i + 2, i + 6)
      if (/^[0-9a-fA-F]{4}$/.test(hex)) {
        out += String.fromCharCode(Number.parseInt(hex, 16))
        i += 5
        continue
      }
    }
    const mapped: Record<string, string> = { n: '\n', t: '\t', r: '\r', f: '\f' }
    out += mapped[next] ?? next
    i += 1
  }
  return out
}

// Properties has no quoting mechanism, only backslash escapes — always
// applied, unlike env-file.ts's quote-only-when-needed.
function escapeValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
}

interface Line {
  text: string
  eol: string
}

function splitLines(content: string): Line[] {
  const lines: Line[] = []
  const regex = /([^\r\n]*)(\r?\n|$)/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(content)) !== null) {
    if (match[1] === '' && match[2] === '' && lines.length > 0) break
    lines.push({ text: match[1]!, eol: match[2]! })
    if (match[2] === '') break
  }
  return lines
}

function joinLines(lines: Line[]): string {
  return lines.map((l) => l.text + l.eol).join('')
}
