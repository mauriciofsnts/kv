import { describe, expect, test } from 'bun:test'
import { appendEnvVar, listEnvVars, quoteValue, setEnvValue } from '../src/domain/env-file.ts'

describe('listEnvVars', () => {
  test('lists variables ignoring comments and blank lines', () => {
    const content = '# database\nPOSTGRES_DB=x\n\nexport POSTGRES_USER=y\n  API_KEY = z\n# END=no\n'
    expect(listEnvVars(content).map((e) => e.name)).toEqual([
      'POSTGRES_DB',
      'POSTGRES_USER',
      'API_KEY',
    ])
  })

  test('duplicates appear once', () => {
    expect(listEnvVars('A=1\nA=2\n').map((e) => e.name)).toEqual(['A'])
  })

  test('a comment line with = is not a variable', () => {
    expect(listEnvVars('# DB_HOST=localhost\n')).toEqual([])
  })
})

describe('setEnvValue', () => {
  test('replaces the value preserving comments, order and blank lines', () => {
    const content = '# database config\nPOSTGRES_DB=placeholder\n\nOTHER=untouched\n'
    const { content: result, found } = setEnvValue(content, 'POSTGRES_DB', 'real_db')
    expect(found).toBe(true)
    expect(result).toBe('# database config\nPOSTGRES_DB=real_db\n\nOTHER=untouched\n')
  })

  test('preserves the export prefix and spacing around =', () => {
    const { content } = setEnvValue('export DB = old\n', 'DB', 'new')
    expect(content).toBe('export DB = new\n')
  })

  test('missing variable: found=false, content untouched', () => {
    const original = 'A=1\n'
    const { content, found } = setEnvValue(original, 'B', 'x')
    expect(found).toBe(false)
    expect(content).toBe(original)
  })

  test('preserves CRLF', () => {
    const { content } = setEnvValue('A=1\r\nB=2\r\n', 'B', 'new')
    expect(content).toBe('A=1\r\nB=new\r\n')
  })

  test('preserves a file without trailing newline', () => {
    const { content } = setEnvValue('A=1', 'A', '2')
    expect(content).toBe('A=2')
  })

  test('updates every duplicate occurrence', () => {
    const { content } = setEnvValue('A=1\nA=2\n', 'A', 'x')
    expect(content).toBe('A=x\nA=x\n')
  })

  test('a value with spaces gets quoted', () => {
    const { content } = setEnvValue('MSG=old\n', 'MSG', 'hello world')
    expect(content).toBe('MSG="hello world"\n')
  })

  test('does not touch a variable whose name is a prefix of another', () => {
    const { content } = setEnvValue('DB=1\nDB_HOST=2\n', 'DB', 'x')
    expect(content).toBe('DB=x\nDB_HOST=2\n')
  })
})

describe('appendEnvVar', () => {
  test('appends at the end with a newline', () => {
    expect(appendEnvVar('A=1\n', 'B', '2')).toBe('A=1\nB=2\n')
  })

  test('adds a newline first if the file does not end with one', () => {
    expect(appendEnvVar('A=1', 'B', '2')).toBe('A=1\nB=2\n')
  })

  test('empty file', () => {
    expect(appendEnvVar('', 'A', '1')).toBe('A=1\n')
  })

  test('uses CRLF if the file uses CRLF', () => {
    expect(appendEnvVar('A=1\r\n', 'B', '2')).toBe('A=1\r\nB=2\r\n')
  })
})

describe('quoteValue', () => {
  test('simple values stay bare', () => {
    expect(quoteValue('simple_123')).toBe('simple_123')
    expect(quoteValue('postgres://host:5432/db')).toBe('postgres://host:5432/db')
  })

  test('empty becomes ""', () => {
    expect(quoteValue('')).toBe('""')
  })

  test('spaces, # and quotes get double quotes with escaping', () => {
    expect(quoteValue('a b')).toBe('"a b"')
    expect(quoteValue('a#b')).toBe('"a#b"')
    expect(quoteValue('di"go')).toBe('"di\\"go"')
    expect(quoteValue('multi\nline')).toBe('"multi\\nline"')
    expect(quoteValue('with$var')).toBe('"with$var"')
  })
})
