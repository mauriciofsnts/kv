import { describe, expect, test } from 'bun:test'
import { appendEnvVar, listEnvVars, quoteValue, setEnvValue } from '../src/core/envfile.ts'

describe('listEnvVars', () => {
  test('lista variáveis ignorando comentários e linhas em branco', () => {
    const content = '# banco\nPOSTGRES_DB=x\n\nexport POSTGRES_USER=y\n  API_KEY = z\n# FIM=nao\n'
    expect(listEnvVars(content).map((e) => e.name)).toEqual([
      'POSTGRES_DB',
      'POSTGRES_USER',
      'API_KEY',
    ])
  })

  test('duplicadas aparecem uma vez', () => {
    expect(listEnvVars('A=1\nA=2\n').map((e) => e.name)).toEqual(['A'])
  })

  test('linha de comentário com = não é variável', () => {
    expect(listEnvVars('# DB_HOST=localhost\n')).toEqual([])
  })
})

describe('setEnvValue', () => {
  test('substitui o valor preservando comentários, ordem e linhas em branco', () => {
    const content = '# config do banco\nPOSTGRES_DB=placeholder\n\nOUTRA=intocada\n'
    const { content: result, found } = setEnvValue(content, 'POSTGRES_DB', 'real_db')
    expect(found).toBe(true)
    expect(result).toBe('# config do banco\nPOSTGRES_DB=real_db\n\nOUTRA=intocada\n')
  })

  test('preserva prefixo export e espaçamento ao redor do =', () => {
    const { content } = setEnvValue('export DB = old\n', 'DB', 'novo')
    expect(content).toBe('export DB = novo\n')
  })

  test('variável ausente: found=false, conteúdo intacto', () => {
    const original = 'A=1\n'
    const { content, found } = setEnvValue(original, 'B', 'x')
    expect(found).toBe(false)
    expect(content).toBe(original)
  })

  test('preserva CRLF', () => {
    const { content } = setEnvValue('A=1\r\nB=2\r\n', 'B', 'novo')
    expect(content).toBe('A=1\r\nB=novo\r\n')
  })

  test('preserva arquivo sem newline final', () => {
    const { content } = setEnvValue('A=1', 'A', '2')
    expect(content).toBe('A=2')
  })

  test('atualiza todas as ocorrências duplicadas', () => {
    const { content } = setEnvValue('A=1\nA=2\n', 'A', 'x')
    expect(content).toBe('A=x\nA=x\n')
  })

  test('valor com espaço ganha aspas', () => {
    const { content } = setEnvValue('MSG=old\n', 'MSG', 'olá mundo')
    expect(content).toBe('MSG="olá mundo"\n')
  })

  test('não altera variável com nome que é prefixo de outra', () => {
    const { content } = setEnvValue('DB=1\nDB_HOST=2\n', 'DB', 'x')
    expect(content).toBe('DB=x\nDB_HOST=2\n')
  })
})

describe('appendEnvVar', () => {
  test('acrescenta no final com newline', () => {
    expect(appendEnvVar('A=1\n', 'B', '2')).toBe('A=1\nB=2\n')
  })

  test('acrescenta newline antes se o arquivo não termina com um', () => {
    expect(appendEnvVar('A=1', 'B', '2')).toBe('A=1\nB=2\n')
  })

  test('arquivo vazio', () => {
    expect(appendEnvVar('', 'A', '1')).toBe('A=1\n')
  })

  test('usa CRLF se o arquivo usa CRLF', () => {
    expect(appendEnvVar('A=1\r\n', 'B', '2')).toBe('A=1\r\nB=2\r\n')
  })
})

describe('quoteValue', () => {
  test('valor simples fica sem aspas', () => {
    expect(quoteValue('simples_123')).toBe('simples_123')
    expect(quoteValue('postgres://host:5432/db')).toBe('postgres://host:5432/db')
  })

  test('vazio vira ""', () => {
    expect(quoteValue('')).toBe('""')
  })

  test('espaços, # e aspas ganham aspas duplas com escape', () => {
    expect(quoteValue('a b')).toBe('"a b"')
    expect(quoteValue('a#b')).toBe('"a#b"')
    expect(quoteValue('di"go')).toBe('"di\\"go"')
    expect(quoteValue('multi\nlinha')).toBe('"multi\\nlinha"')
    expect(quoteValue('com$var')).toBe('"com$var"')
  })
})
