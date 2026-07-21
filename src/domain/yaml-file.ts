// YAML parser/patcher, line-preserving like domain/env-file.ts. Supports
// block mappings only — nested keys become dot-notation names (`db.host`
// for `db:\n  host: x`). Sequences, flow collections (`[...]`/`{...}`),
// block scalars (`|`/`>`), anchors/aliases and multi-document files are
// opaque: their keys are skipped rather than risk corrupting a structure
// this module can't safely rewrite.
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

interface MapLine {
  lineIndex: number
  name: string
  indent: number
  keyText: string
  rawValue: string
  quote: '"' | "'" | null
}

interface Frame {
  indent: number
  key: string
}

function scan(content: string): MapLine[] {
  const lines = splitLines(content)
  const stack: Frame[] = []
  const entries: MapLine[] = []
  for (const [lineIndex, line] of lines.entries()) {
    const text = line.text
    const trimmed = text.trim()
    if (trimmed === '' || trimmed.startsWith('#') || trimmed === '---' || trimmed === '...') continue
    const indent = text.length - text.trimStart().length
    if (/^[-?]\s|^-$/.test(trimmed)) continue // sequence item: opaque

    const match = trimmed.match(/^((?:"[^"]*"|'[^']*'|[^:#]+)):(\s+(.*)|$)/)
    if (!match) continue
    const keyRaw = match[1]!.trim()
    const key = unquoteKeySegment(keyRaw)
    const valuePart = (match[3] ?? '').trimEnd()

    while (stack.length && stack[stack.length - 1]!.indent >= indent) stack.pop()

    const valueEnd = findCommentStart(valuePart)
    const rawValue = valueEnd >= 0 ? valuePart.slice(0, valueEnd) : valuePart
    const trimmedValue = rawValue.trim()

    if (trimmedValue === '') {
      // Opens a nested block (mapping or sequence) on following lines.
      stack.push({ indent, key })
      continue
    }
    if (
      trimmedValue.startsWith('[') ||
      trimmedValue.startsWith('{') ||
      trimmedValue === '|' ||
      trimmedValue === '>' ||
      /^[|>][+-]?\d*$/.test(trimmedValue) ||
      trimmedValue.startsWith('&') ||
      trimmedValue.startsWith('*')
    ) {
      continue // opaque value: not a plain scalar we can safely rewrite
    }

    const name = [...stack.map((f) => f.key), key].join('.')
    const quote = trimmedValue.startsWith('"') ? '"' : trimmedValue.startsWith("'") ? "'" : null
    entries.push({ lineIndex, name, indent, keyText: keyRaw, rawValue, quote })
  }
  return entries
}

function unquoteKeySegment(seg: string): string {
  if (seg.startsWith('"') || seg.startsWith("'")) return seg.slice(1, -1)
  return seg
}

export function listVars(content: string): VarEntry[] {
  const seen = new Set<string>()
  const entries: VarEntry[] = []
  for (const m of scan(content)) {
    if (seen.has(m.name)) continue
    seen.add(m.name)
    entries.push({ name: m.name, lineIndex: m.lineIndex })
  }
  return entries
}

export function parseEntries(content: string): Entry[] {
  const byName = new Map<string, string>()
  for (const m of scan(content)) {
    byName.set(m.name, unquoteScalar(m.rawValue.trim(), m.quote))
  }
  return [...byName.entries()].map(([name, value]) => ({ name, value }))
}

export function setValue(content: string, name: string, value: string): SetValueResult {
  const lines = splitLines(content)
  let found = false
  for (const m of scan(content)) {
    if (m.name !== name) continue
    found = true
    const original = lines[m.lineIndex]!.text
    const indentStr = ' '.repeat(m.indent)
    // Everything after "key:" — its leading whitespace is the original
    // spacing before the value, and whatever follows the value (more
    // whitespace + an inline comment, or nothing) is preserved verbatim.
    const rest = original.slice(indentStr.length + m.keyText.length + 1)
    const lead = rest.match(/^\s*/)![0]
    const commentAt = findCommentStart(rest)
    const valueEnd = commentAt >= 0 ? commentAt : rest.length
    const trimmedValue = rest.slice(lead.length, valueEnd).trimEnd()
    const suffix = rest.slice(lead.length + trimmedValue.length)
    const scalar = m.quote ? quoteWith(value, m.quote) : plainOrQuoted(value)
    lines[m.lineIndex]!.text = `${indentStr}${m.keyText}:${lead}${scalar}${suffix}`
  }
  return { content: joinLines(lines), found }
}

// Only top-level (dot-free) and one-level-nested names are appended
// structurally; deeper chains are appended as a fresh top-level block using
// the full dotted path as a single key segment is not valid YAML, so we
// build the minimal nested block needed and attach it to the deepest
// existing matching prefix, or at EOF if none exists.
export function appendVar(content: string, name: string, value: string): string {
  const segments = name.split('.')
  const eol = content.includes('\r\n') ? '\r\n' : '\n'
  const lines = splitLines(content)
  const frames = collectFrames(content)

  let matchedDepth = 0
  let insertAt = lines.length
  let insertIndent = 0
  for (let depth = 1; depth < segments.length; depth++) {
    const prefix = segments.slice(0, depth).join('.')
    const frame = frames.find((f) => f.path === prefix)
    if (!frame) break
    matchedDepth = depth
    insertAt = frame.blockEnd
    insertIndent = frame.indent + 2
  }

  const remaining = segments.slice(matchedDepth)
  const needsNewlineFirst = insertAt === lines.length && content.length > 0 && !content.endsWith('\n')
  const block: string[] = []
  remaining.forEach((seg, i) => {
    const indent = ' '.repeat(insertIndent + i * 2)
    if (i === remaining.length - 1) block.push(`${indent}${seg}: ${plainOrQuoted(value)}`)
    else block.push(`${indent}${seg}:`)
  })

  const newLines: Line[] = block.map((text) => ({ text, eol }))
  if (needsNewlineFirst) lines[lines.length - 1]!.eol = eol
  lines.splice(insertAt, 0, ...newLines)
  return joinLines(lines)
}

interface BlockFrame {
  path: string
  indent: number
  blockEnd: number
}

// One frame per mapping key that opens a nested block (i.e. every prefix
// reachable in dot-notation), with the line range of its subtree.
function collectFrames(content: string): BlockFrame[] {
  const lines = splitLines(content)
  const stack: Frame[] = []
  const openFrames: { path: string; indent: number; start: number }[] = []
  const closed: BlockFrame[] = []

  const closeFramesDeeperThan = (indent: number, atLine: number) => {
    while (openFrames.length && openFrames[openFrames.length - 1]!.indent >= indent) {
      const f = openFrames.pop()!
      closed.push({ path: f.path, indent: f.indent, blockEnd: atLine })
    }
  }

  lines.forEach((line, lineIndex) => {
    const text = line.text
    const trimmed = text.trim()
    if (trimmed === '' || trimmed.startsWith('#') || trimmed === '---' || trimmed === '...') return
    const indent = text.length - text.trimStart().length
    if (/^[-?]\s|^-$/.test(trimmed)) return

    const match = trimmed.match(/^((?:"[^"]*"|'[^']*'|[^:#]+)):(\s+(.*)|$)/)
    if (!match) return
    const key = unquoteKeySegment(match[1]!.trim())
    const valuePart = (match[3] ?? '').trim()

    closeFramesDeeperThan(indent, lineIndex)
    while (stack.length && stack[stack.length - 1]!.indent >= indent) stack.pop()
    const path = [...stack.map((f) => f.key), key].join('.')

    if (valuePart === '') {
      stack.push({ indent, key })
      openFrames.push({ path, indent, start: lineIndex })
    }
  })
  closeFramesDeeperThan(-1, lines.length)
  return closed
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
    else if (c === '#' && (i === 0 || raw[i - 1] === ' ' || raw[i - 1] === '\t')) return i
  }
  return -1
}

function unquoteScalar(trimmed: string, quote: '"' | "'" | null): string {
  if (quote === '"') {
    const m = trimmed.match(/^"((?:[^"\\]|\\.)*)"/)
    if (m) return m[1]!.replace(/\\(["\\ntr])/g, (_, c: string) => ({ n: '\n', t: '\t', r: '\r' }[c] ?? c))
  }
  if (quote === "'") {
    const m = trimmed.match(/^'((?:[^']|'')*)'/)
    if (m) return m[1]!.replace(/''/g, "'")
  }
  return trimmed
}

const RESERVED = new Set(['true', 'false', 'null', 'yes', 'no', 'on', 'off', '~', ''])

function plainOrQuoted(value: string): string {
  const bareSafe = /^[A-Za-z0-9_\-./@]+$/.test(value)
  const looksReserved = RESERVED.has(value.toLowerCase()) || /^-?\d+(\.\d+)?$/.test(value)
  if (bareSafe && !looksReserved) return value
  return quoteWith(value, '"')
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
