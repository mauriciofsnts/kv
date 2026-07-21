// TOML parser/patcher, line-preserving like domain/env-file.ts. Only plain
// scalar values on a single line are addressable (dotted-key names, built
// from `[table]` headers plus the key on the line). Arrays, inline tables,
// multi-line strings and array-of-tables (`[[...]]`) are opaque: their keys
// never appear in listVars/parseEntries and setValue reports them as
// "not found" rather than risk corrupting the structure.
export interface VarEntry {
  name: string
  lineIndex: number
}

export interface Entry {
  name: string
  value: string
}

export interface SetValueResult {
  content: string
  found: boolean
}

interface KeyLine {
  lineIndex: number
  name: string
  indent: string
  keyText: string
  sep: string
  rawValue: string
  quote: '"' | "'" | null
}

interface TableLine {
  lineIndex: number
  path: string
  isArrayTable: boolean
}

function scan(content: string): { keys: KeyLine[]; tables: TableLine[] } {
  const lines = splitLines(content)
  const keys: KeyLine[] = []
  const tables: TableLine[] = []
  let prefix = ''
  let inArrayTable = false
  for (const [lineIndex, line] of lines.entries()) {
    const text = line.text
    const trimmed = text.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue

    const arrayTable = trimmed.match(/^\[\[\s*([^[\]]+?)\s*\]\]\s*(#.*)?$/)
    if (arrayTable) {
      prefix = arrayTable[1]!.trim()
      inArrayTable = true
      tables.push({ lineIndex, path: prefix, isArrayTable: true })
      continue
    }
    const table = trimmed.match(/^\[\s*([^[\]]+?)\s*\]\s*(#.*)?$/)
    if (table) {
      prefix = table[1]!.trim()
      inArrayTable = false
      tables.push({ lineIndex, path: prefix, isArrayTable: false })
      continue
    }
    if (inArrayTable) continue // opaque: keys inside array-of-tables aren't addressable

    const match = text.match(/^(\s*)((?:[A-Za-z0-9_-]+|"[^"]*"|'[^']*')(?:\s*\.\s*(?:[A-Za-z0-9_-]+|"[^"]*"|'[^']*'))*)(\s*=\s*)(.*)$/)
    if (!match) continue
    const [, indent, keyText, sep, rest] = match as unknown as [string, string, string, string, string]
    const valueEnd = findCommentStart(rest)
    const rawValue = valueEnd >= 0 ? rest.slice(0, valueEnd) : rest
    const trimmedValue = rawValue.trim()
    if (trimmedValue === '') continue
    if (/^["']{3}/.test(trimmedValue)) continue // multi-line string: opaque
    if (trimmedValue.startsWith('[') || trimmedValue.startsWith('{')) continue // array/inline table: opaque

    const dottedKey = keyText
      .split('.')
      .map((seg) => unquoteKeySegment(seg.trim()))
      .join('.')
    const name = prefix ? `${prefix}.${dottedKey}` : dottedKey
    const quote = trimmedValue.startsWith('"') ? '"' : trimmedValue.startsWith("'") ? "'" : null
    keys.push({ lineIndex, name, indent, keyText, sep, rawValue, quote })
  }
  return { keys, tables }
}

function unquoteKeySegment(seg: string): string {
  if (seg.startsWith('"') || seg.startsWith("'")) return seg.slice(1, -1)
  return seg
}

export function listVars(content: string): VarEntry[] {
  const seen = new Set<string>()
  const entries: VarEntry[] = []
  for (const key of scan(content).keys) {
    if (seen.has(key.name)) continue
    seen.add(key.name)
    entries.push({ name: key.name, lineIndex: key.lineIndex })
  }
  return entries
}

export function parseEntries(content: string): Entry[] {
  const byName = new Map<string, string>()
  for (const key of scan(content).keys) {
    byName.set(key.name, unquoteScalar(key.rawValue.trim(), key.quote))
  }
  return [...byName.entries()].map(([name, value]) => ({ name, value }))
}

export function setValue(content: string, name: string, value: string): SetValueResult {
  const lines = splitLines(content)
  const { keys } = scan(content)
  let found = false
  for (const key of keys) {
    if (key.name !== name) continue
    found = true
    const rest = lines[key.lineIndex]!.text.slice(
      key.indent.length + key.keyText.length + key.sep.length,
    )
    const commentAt = findCommentStart(rest)
    const valueEnd = commentAt >= 0 ? commentAt : rest.length
    const trimmedValue = rest.slice(0, valueEnd).trimEnd()
    const suffix = rest.slice(trimmedValue.length)
    const newScalar = key.quote
      ? quoteWith(value, key.quote)
      : quoteWith(value, '"') // a formerly-bare literal becomes a quoted string
    lines[key.lineIndex]!.text = `${key.indent}${key.keyText}${key.sep}${newScalar}${suffix}`
  }
  return { content: joinLines(lines), found }
}

// Appends a standalone dotted-key assignment. If a `[prefix]` table for the
// key's parent already exists, the line is inserted at the end of that
// table's block instead of at EOF, so it doesn't get orphaned under whatever
// table happens to come last in the file.
export function appendVar(content: string, name: string, value: string): string {
  const lines = splitLines(content)
  const { tables } = scan(content)
  const lastDot = name.lastIndexOf('.')
  const parent = lastDot >= 0 ? name.slice(0, lastDot) : ''
  const leafKey = lastDot >= 0 ? name.slice(lastDot + 1) : name
  const eol = content.includes('\r\n') ? '\r\n' : '\n'

  const parentTable = parent
    ? tables.filter((t) => !t.isArrayTable && t.path === parent).pop()
    : undefined

  if (parentTable) {
    const insertAt = findTableBlockEnd(lines, parentTable.lineIndex, tables)
    lines.splice(insertAt, 0, { text: `${leafKey} = ${quoteWith(value, '"')}`, eol })
    return joinLines(lines)
  }

  const needsNewline = content.length > 0 && !content.endsWith('\n')
  return `${content}${needsNewline ? eol : ''}${name} = ${quoteWith(value, '"')}${eol}`
}

function findTableBlockEnd(lines: Line[], tableLineIndex: number, tables: TableLine[]): number {
  const nextTable = tables.find((t) => t.lineIndex > tableLineIndex)
  let end = nextTable ? nextTable.lineIndex : lines.length
  while (end > tableLineIndex + 1 && lines[end - 1]!.text.trim() === '') end--
  return end
}

function findCommentStart(raw: string): number {
  let inString: '"' | "'" | null = null
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]
    if (inString) {
      if (c === '\\' && inString === '"') i++
      else if (c === inString) inString = null
      continue
    }
    if (c === '"' || c === "'") inString = c
    else if (c === '#') return i
  }
  return -1
}

function unquoteScalar(trimmed: string, quote: '"' | "'" | null): string {
  if (quote === '"') {
    const m = trimmed.match(/^"((?:[^"\\]|\\.)*)"/)
    if (m) return m[1]!.replace(/\\(["\\ntr])/g, (_, c: string) => ({ n: '\n', t: '\t', r: '\r' }[c] ?? c))
  }
  if (quote === "'") {
    const m = trimmed.match(/^'([^']*)'/)
    if (m) return m[1]!
  }
  return trimmed
}

function quoteWith(value: string, quote: '"' | "'"): string {
  if (quote === "'") return `'${value.replace(/'/g, "''")}'`
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\t/g, '\\t')}"`
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
