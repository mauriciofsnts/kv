// Parser/patcher de .env que preserva o arquivo byte a byte fora dos valores
// alterados: comentários, linhas em branco, ordem, prefixo `export`, CRLF.

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

export interface SetValueResult {
  content: string
  found: boolean
}

// Substitui o valor de `name` preservando o resto da linha. Quando a variável
// aparece mais de uma vez, todas as ocorrências são atualizadas (a última é a
// que vale para quem consome o .env, mas deixar as anteriores com o valor
// antigo vazaria um placeholder desatualizado).
export function setEnvValue(content: string, name: string, value: string): SetValueResult {
  const lines = splitLines(content)
  let found = false
  for (const line of lines) {
    const match = line.text.match(VAR_LINE)
    if (match && match[2] === name) {
      found = true
      line.text = `${match[1]}${match[2]}${match[3]}${quoteValue(value)}`
    }
  }
  return { content: joinLines(lines), found }
}

export function appendEnvVar(content: string, name: string, value: string): string {
  const eol = content.includes('\r\n') ? '\r\n' : '\n'
  const needsNewline = content.length > 0 && !content.endsWith('\n')
  return `${content}${needsNewline ? eol : ''}${name}=${quoteValue(value)}${eol}`
}

// Aspas duplas apenas quando o valor precisa: espaços, #, aspas, quebras de
// linha ou espaços nas pontas. Valores simples ficam sem aspas, como se escreve à mão.
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
