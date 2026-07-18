// .env parser/patcher that preserves the file byte-for-byte outside the
// values it changes: comments, blank lines, order, `export` prefix, CRLF.

const VAR_LINE = /^(\s*(?:export\s+)?)([A-Za-z_][A-Za-z0-9_]*)(\s*=\s*)(.*)$/

export interface EnvVarEntry {
  name: string
  lineIndex: number
}

export function listEnvVars(content: string): EnvVarEntry[] {
  const seen = new Set<string>()
  const entries: EnvVarEntry[] = []
  splitLines(content).forEach((line, lineIndex) => {
    const match = line.text.match(VAR_LINE)
    if (match && !seen.has(match[2]!)) {
      seen.add(match[2]!)
      entries.push({ name: match[2]!, lineIndex })
    }
  })
  return entries
}

export interface EnvEntry {
  name: string
  value: string
}

// Parses names AND values (what `kv scan`/`kv diff` consume). Follows
// consumer semantics: when a variable repeats, the last occurrence wins.
// Quoting: "..." unescapes \" \\ \n; '...' is literal; unquoted values are
// trimmed and lose trailing ` # comments`.
export function parseEnvEntries(content: string): EnvEntry[] {
  const byName = new Map<string, string>()
  for (const line of splitLines(content)) {
    const match = line.text.match(VAR_LINE)
    if (match) byName.set(match[2]!, unquoteValue(match[4]!))
  }
  return [...byName.entries()].map(([name, value]) => ({ name, value }))
}

function unquoteValue(raw: string): string {
  const trimmed = raw.trim()
  // Quoted values may be followed by a comment: A="v" # note
  const doubleQuoted = trimmed.match(/^"((?:[^"\\]|\\.)*)"/)
  if (doubleQuoted) {
    return doubleQuoted[1]!.replace(/\\(["\\n])/g, (_, c: string) => (c === 'n' ? '\n' : c))
  }
  const singleQuoted = trimmed.match(/^'([^']*)'/)
  if (singleQuoted) return singleQuoted[1]!
  const commentAt = trimmed.search(/\s#/)
  return (commentAt >= 0 ? trimmed.slice(0, commentAt) : trimmed).trim()
}

export interface SetValueResult {
  content: string
  found: boolean
}

// Replaces the value of `name` keeping the rest of the line intact. When the
// variable appears more than once, every occurrence is updated (the last one
// wins for whoever consumes the .env, but leaving earlier ones with the old
// value would leak a stale placeholder). Inline ` # comments` survive, keeping
// their column when the new value fits.
export function setEnvValue(content: string, name: string, value: string): SetValueResult {
  const lines = splitLines(content)
  let found = false
  for (const line of lines) {
    const match = line.text.match(VAR_LINE)
    if (match && match[2] === name) {
      found = true
      const rest = match[4]!
      const hash = findInlineCommentStart(rest)
      // When the old value is empty, `\s*` after `=` swallowed the padding
      // that aligned the comment — drop it instead of prefixing the value.
      const sep = rest.startsWith('#') ? match[3]!.replace(/\s+$/, '') : match[3]!
      let text = `${match[1]}${match[2]}${sep}${quoteValue(value)}`
      if (hash >= 0) {
        const column = match[1]!.length + match[2]!.length + match[3]!.length + hash
        text += ' '.repeat(Math.max(1, column - text.length)) + rest.slice(hash)
      }
      line.text = text
    }
  }
  return { content: joinLines(lines), found }
}

// Index of an inline comment's `#` inside the raw value portion of a line,
// or -1. Mirrors unquoteValue: `#` inside quotes or glued to an unquoted
// value (`a#b`) is not a comment.
function findInlineCommentStart(raw: string): number {
  if (raw.startsWith('#')) return 0
  const quotedHead = raw.match(/^"(?:[^"\\]|\\.)*"/) ?? raw.match(/^'[^']*'/)
  const offset = quotedHead ? quotedHead[0].length : 0
  const at = raw.slice(offset).search(quotedHead ? /#/ : /\s#/)
  if (at < 0) return -1
  return offset + at + (quotedHead ? 0 : 1)
}

export function appendEnvVar(content: string, name: string, value: string): string {
  const eol = content.includes('\r\n') ? '\r\n' : '\n'
  const needsNewline = content.length > 0 && !content.endsWith('\n')
  return `${content}${needsNewline ? eol : ''}${name}=${quoteValue(value)}${eol}`
}

// Double quotes only when the value needs them: spaces, #, quotes, newlines
// or leading/trailing whitespace. Simple values stay bare, like hand-written.
export function quoteValue(value: string): string {
  if (value === '') return '""'
  const needsQuotes = /[\s#"'\\$`]/.test(value) || value !== value.trim()
  if (!needsQuotes) return value
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`
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
