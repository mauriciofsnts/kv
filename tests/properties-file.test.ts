import { describe, expect, test } from 'bun:test'
import { appendVar, listVars, parseEntries, setValue } from '../src/domain/properties-file.ts'

describe('listVars', () => {
  test('lists keys ignoring comments and blank lines', () => {
    const content = '# database\ndb.host=x\n\n! legacy comment\ndb.port = 5432\n'
    expect(listVars(content).map((e) => e.name)).toEqual(['db.host', 'db.port'])
  })

  test('supports : as separator', () => {
    expect(listVars('name: value\n').map((e) => e.name)).toEqual(['name'])
  })

  test('duplicates appear once', () => {
    expect(listVars('A=1\nA=2\n').map((e) => e.name)).toEqual(['A'])
  })
})

describe('parseEntries', () => {
  test('unescapes common backslash escapes', () => {
    const entries = parseEntries('MSG=line1\\nline2\nPATH=C\\:\\\\tmp\n')
    expect(entries.find((e) => e.name === 'MSG')?.value).toBe('line1\nline2')
  })
})

describe('setValue', () => {
  test('replaces the value preserving comments, order and blank lines', () => {
    const content = '# database config\ndb.name=placeholder\n\nOTHER=untouched\n'
    const { content: result, found } = setValue(content, 'db.name', 'real_db')
    expect(found).toBe(true)
    expect(result).toBe('# database config\ndb.name=real_db\n\nOTHER=untouched\n')
  })

  test('preserves the : separator and its spacing', () => {
    const { content } = setValue('name : old\n', 'name', 'new')
    expect(content).toBe('name : new\n')
  })

  test('missing key: found=false, content untouched', () => {
    const original = 'A=1\n'
    const { content, found } = setValue(original, 'B', 'x')
    expect(found).toBe(false)
    expect(content).toBe(original)
  })

  test('escapes backslashes and newlines, no quoting', () => {
    const { content } = setValue('A=old\n', 'A', 'a\\b\nc')
    expect(content).toBe('A=a\\\\b\\nc\n')
  })

  test('updates every duplicate occurrence', () => {
    const { content } = setValue('A=1\nA=2\n', 'A', 'x')
    expect(content).toBe('A=x\nA=x\n')
  })
})

describe('appendVar', () => {
  test('appends at the end with a newline', () => {
    expect(appendVar('A=1\n', 'B', '2')).toBe('A=1\nB=2\n')
  })

  test('adds a newline first if the file does not end with one', () => {
    expect(appendVar('A=1', 'B', '2')).toBe('A=1\nB=2\n')
  })
})
