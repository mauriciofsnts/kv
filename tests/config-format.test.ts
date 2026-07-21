import { describe, expect, test } from 'bun:test'
import { formatFor } from '../src/domain/config-format.ts'

describe('formatFor', () => {
  test('.env and extensionless paths use the .env dialect', () => {
    expect(formatFor('.env').listVars('A=1\n').map((e) => e.name)).toEqual(['A'])
    expect(formatFor('/path/to/.env.production').listVars('A=1\n').map((e) => e.name)).toEqual(['A'])
  })

  test('.properties uses the properties dialect', () => {
    expect(formatFor('app.properties').listVars('a.b=1\n').map((e) => e.name)).toEqual(['a.b'])
  })

  test('.yaml and .yml use the yaml dialect', () => {
    expect(formatFor('config.yaml').listVars('a:\n  b: 1\n').map((e) => e.name)).toEqual(['a.b'])
    expect(formatFor('config.yml').listVars('a:\n  b: 1\n').map((e) => e.name)).toEqual(['a.b'])
  })

  test('.toml uses the toml dialect', () => {
    expect(formatFor('config.toml').listVars('[a]\nb = "1"\n').map((e) => e.name)).toEqual(['a.b'])
  })

  test('is case-insensitive on the extension', () => {
    expect(formatFor('config.TOML').listVars('a = "1"\n').map((e) => e.name)).toEqual(['a'])
  })
})
