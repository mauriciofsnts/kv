import { describe, expect, test } from 'bun:test'
import { appendVar, listVars, parseEntries, setValue } from '../src/domain/toml-file.ts'

describe('listVars', () => {
  test('flattens table headers into dotted names', () => {
    const content = 'title = "app"\n\n[database]\nhost = "localhost"\nport = 5432\n'
    expect(listVars(content).map((e) => e.name)).toEqual(['title', 'database.host', 'database.port'])
  })

  test('supports inline dotted keys', () => {
    expect(listVars('db.host = "x"\n').map((e) => e.name)).toEqual(['db.host'])
  })

  test('skips keys inside array-of-tables and arrays/inline tables', () => {
    const content = '[[servers]]\nhost = "a"\n\n[main]\ntags = ["a", "b"]\nopts = { x = 1 }\nname = "ok"\n'
    expect(listVars(content).map((e) => e.name)).toEqual(['main.name'])
  })

  test('nested table headers accumulate the prefix', () => {
    const content = '[a]\n[a.b]\nc = "v"\n'
    expect(listVars(content).map((e) => e.name)).toEqual(['a.b.c'])
  })
})

describe('parseEntries', () => {
  test('unquotes double and single quoted strings', () => {
    const content = "a = \"x\\ny\"\nb = 'lit\\eral'\n"
    const entries = parseEntries(content)
    expect(entries.find((e) => e.name === 'a')?.value).toBe('x\ny')
    expect(entries.find((e) => e.name === 'b')?.value).toBe('lit\\eral')
  })

  test('bare (unquoted) literals are returned as raw text', () => {
    expect(parseEntries('port = 5432\n')[0]?.value).toBe('5432')
  })
})

describe('setValue', () => {
  test('replaces a quoted value keeping the quote style', () => {
    const { content, found } = setValue('[database]\nhost = "old"\n', 'database.host', 'new')
    expect(found).toBe(true)
    expect(content).toBe('[database]\nhost = "new"\n')
  })

  test('replacing a bare literal quotes the new value', () => {
    const { content } = setValue('retries = 0\n', 'retries', 'many')
    expect(content).toBe('retries = "many"\n')
  })

  test('preserves an inline comment', () => {
    const { content } = setValue('port = "old" # http\n', 'port', 'new')
    expect(content).toBe('port = "new" # http\n')
  })

  test('missing key: found=false, content untouched', () => {
    const original = 'a = "1"\n'
    const { content, found } = setValue(original, 'b', 'x')
    expect(found).toBe(false)
    expect(content).toBe(original)
  })

  test('does not touch opaque array-of-table keys', () => {
    const original = '[[servers]]\nhost = "a"\n'
    const { found } = setValue(original, 'servers.host', 'x')
    expect(found).toBe(false)
  })
})

describe('appendVar', () => {
  test('appends a dotted key at EOF when no matching table exists', () => {
    expect(appendVar('title = "x"\n', 'db.host', 'y')).toBe('title = "x"\ndb.host = "y"\n')
  })

  test('inserts inside an existing matching table block', () => {
    const content = '[database]\nhost = "x"\n\n[other]\nk = "v"\n'
    const result = appendVar(content, 'database.port', '5432')
    expect(result).toBe('[database]\nhost = "x"\nport = "5432"\n\n[other]\nk = "v"\n')
  })
})
