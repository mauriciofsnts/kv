import { describe, expect, test } from 'bun:test'
import { appendVar, listVars, parseEntries, setValue } from '../src/domain/yaml-file.ts'

describe('listVars', () => {
  test('flattens nested mappings into dotted names', () => {
    const content = 'title: app\ndatabase:\n  host: localhost\n  port: 5432\n'
    expect(listVars(content).map((e) => e.name)).toEqual(['title', 'database.host', 'database.port'])
  })

  test('duplicated top-level keys after a nested block pop the stack correctly', () => {
    const content = 'a:\n  b: 1\nc: 2\n'
    expect(listVars(content).map((e) => e.name)).toEqual(['a.b', 'c'])
  })

  test('skips sequence items and flow/block-scalar values', () => {
    const content = 'list:\n  - a\n  - b\ninline: [1, 2]\nmap: { x: 1 }\nblock: |\n  text\nok: value\n'
    expect(listVars(content).map((e) => e.name)).toEqual(['ok'])
  })

  test('ignores comments and blank lines', () => {
    const content = '# top comment\nname: value\n\n'
    expect(listVars(content).map((e) => e.name)).toEqual(['name'])
  })
})

describe('parseEntries', () => {
  test('unquotes double and single quoted scalars', () => {
    const content = 'a: "x\\ny"\nb: \'it\'\'s\'\n'
    const entries = parseEntries(content)
    expect(entries.find((e) => e.name === 'a')?.value).toBe('x\ny')
    expect(entries.find((e) => e.name === 'b')?.value).toBe("it's")
  })

  test('plain scalars are trimmed', () => {
    expect(parseEntries('port: 5432\n')[0]?.value).toBe('5432')
  })
})

describe('setValue', () => {
  test('replaces a nested value preserving indentation and siblings', () => {
    const content = 'database:\n  host: old\n  port: 5432\n'
    const { content: result, found } = setValue(content, 'database.host', 'new')
    expect(found).toBe(true)
    expect(result).toBe('database:\n  host: new\n  port: 5432\n')
  })

  test('quotes a value that would otherwise be a special/reserved scalar', () => {
    const { content } = setValue('flag: old\n', 'flag', 'true')
    expect(content).toBe('flag: "true"\n')
  })

  test('preserves an inline comment', () => {
    const { content } = setValue('port: old  # http\n', 'port', 'new')
    expect(content).toBe('port: new  # http\n')
  })

  test('missing key: found=false, content untouched', () => {
    const original = 'a: 1\n'
    const { content, found } = setValue(original, 'b', 'x')
    expect(found).toBe(false)
    expect(content).toBe(original)
  })
})

describe('appendVar', () => {
  test('appends a top-level key at EOF', () => {
    expect(appendVar('a: 1\n', 'b', 'hello')).toBe('a: 1\nb: hello\n')
  })

  // Numeric-looking values are quoted so a real YAML parser reads them back
  // as strings, not ints — round-tripping a secret shouldn't change its type.
  test('quotes a value that looks like a number', () => {
    expect(appendVar('a: 1\n', 'b', '2')).toBe('a: 1\nb: "2"\n')
  })

  test('inserts a nested key under an existing matching parent block', () => {
    const content = 'database:\n  host: x\nother: y\n'
    const result = appendVar(content, 'database.port', '5432')
    expect(result).toBe('database:\n  host: x\n  port: "5432"\nother: y\n')
  })

  test('builds a brand-new nested chain when no prefix exists', () => {
    const result = appendVar('title: x\n', 'db.creds.password', 'secret')
    expect(result).toBe('title: x\ndb:\n  creds:\n    password: secret\n')
  })
})
