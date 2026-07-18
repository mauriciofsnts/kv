import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ConfigStore, SessionCache } from '../src/application/ports.ts'
import { makeApplyEnv } from '../src/application/use-cases/apply-env.ts'
import { makeManageSecrets } from '../src/application/use-cases/manage-secrets.ts'
import { makeVaultAccess } from '../src/application/use-cases/vault-access.ts'
import { parseEnvEntries } from '../src/domain/env-file.ts'
import { DEFAULT_GROUP, addAliases, getSecret, groupEnvMap, setSecret } from '../src/domain/secret.ts'
import { nodeCrypto } from '../src/infrastructure/crypto/node-crypto.ts'
import { fsEnvFiles } from '../src/infrastructure/env/fs-env-files.ts'
import { repositoryFor } from '../src/infrastructure/storage/repository-factory.ts'

let dir: string

function makeTestbed() {
  const sessions: SessionCache = {
    store: () => ({ volatile: true }),
    load: () => null,
    clear() {},
  }
  const config: ConfigStore = {
    vaultLocation: () => join(dir, 'vault.enc'),
    setVaultLocation() {},
    locationOverridden: () => false,
    minPasswordLength: () => 8,
  }
  const access = makeVaultAccess({ crypto: nodeCrypto, sessions, config, repositoryFor })
  return { access, secrets: makeManageSecrets(access), applyEnv: makeApplyEnv(fsEnvFiles) }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'key-envsync-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('parseEnvEntries (domain)', () => {
  test('unquotes double quotes with escapes, keeps single quotes literal', () => {
    const entries = parseEnvEntries('A="line1\\nline2 \\"q\\""\nB=\'literal $x\'\nC=plain\n')
    expect(entries).toEqual([
      { name: 'A', value: 'line1\nline2 "q"' },
      { name: 'B', value: 'literal $x' },
      { name: 'C', value: 'plain' },
    ])
  })

  test('strips trailing comments from unquoted values only', () => {
    const entries = parseEnvEntries('A=value # comment\nB="kept # inside"\n')
    expect(entries).toEqual([
      { name: 'A', value: 'value' },
      { name: 'B', value: 'kept # inside' },
    ])
  })

  test('quoted value followed by a comment is unquoted correctly', () => {
    const entries = parseEnvEntries('A="postgres://x" # main db\nB=\'lit\' # note\n')
    expect(entries).toEqual([
      { name: 'A', value: 'postgres://x' },
      { name: 'B', value: 'lit' },
    ])
  })

  test('last occurrence wins on duplicates (consumer semantics)', () => {
    expect(parseEnvEntries('A=1\nA=2\n')).toEqual([{ name: 'A', value: '2' }])
  })
})

describe('groupEnvMap (domain)', () => {
  test('includes canonical names and aliases with the same value', () => {
    const data = { groups: { [DEFAULT_GROUP]: {} } }
    setSecret(data, DEFAULT_GROUP, 'DATABASE_URL', 'postgres://x')
    addAliases(data, DEFAULT_GROUP, 'DATABASE_URL', ['DB_URL'])
    setSecret(data, DEFAULT_GROUP, 'API_KEY', 'tok')
    expect(groupEnvMap(data, DEFAULT_GROUP)).toEqual({
      DATABASE_URL: 'postgres://x',
      DB_URL: 'postgres://x',
      API_KEY: 'tok',
    })
  })
})

describe('diff use case', () => {
  test('classifies in-sync, differs, missing and not-in-env (alias-aware)', async () => {
    const { access, applyEnv } = makeTestbed()
    const vault = await access.initVault('password-123')
    setSecret(vault.data, DEFAULT_GROUP, 'SAME', 'v1')
    setSecret(vault.data, DEFAULT_GROUP, 'CHANGED', 'new-value')
    setSecret(vault.data, DEFAULT_GROUP, 'VAULT_ONLY', 'x')
    setSecret(vault.data, DEFAULT_GROUP, 'VIA_ALIAS', 'a1')
    addAliases(vault.data, DEFAULT_GROUP, 'VIA_ALIAS', ['ALIASED'])

    const envPath = join(dir, '.env')
    writeFileSync(envPath, 'SAME=v1\nCHANGED=old-value\nENV_ONLY=e\nALIASED=a1\n')

    const diff = applyEnv.diff(vault, DEFAULT_GROUP, envPath)
    expect(diff.inSync.sort()).toEqual(['ALIASED', 'SAME'])
    expect(diff.differs).toEqual(['CHANGED'])
    expect(diff.missingFromVault).toEqual(['ENV_ONLY'])
    expect(diff.notInEnv).toEqual(['VAULT_ONLY'])
  })
})

describe('applyAll use case', () => {
  test('safe mode skips variables that already hold a different value', async () => {
    const { access, applyEnv } = makeTestbed()
    const vault = await access.initVault('password-123')
    setSecret(vault.data, DEFAULT_GROUP, 'EMPTY', 'filled')
    setSecret(vault.data, DEFAULT_GROUP, 'TAKEN', 'vault-value')
    setSecret(vault.data, DEFAULT_GROUP, 'SAME', 'v1')

    const envPath = join(dir, '.env')
    writeFileSync(envPath, 'EMPTY=\nTAKEN=local-value\nSAME=v1\nUNKNOWN=x\n')

    const result = applyEnv.applyAll(vault, DEFAULT_GROUP, envPath)
    expect(result.applied.sort()).toEqual(['EMPTY', 'SAME'])
    expect(result.skipped).toEqual(['TAKEN'])
    expect(result.missing).toEqual(['UNKNOWN'])
    expect(readFileSync(envPath, 'utf8')).toBe('EMPTY=filled\nTAKEN=local-value\nSAME=v1\nUNKNOWN=x\n')
  })

  test('force overwrites values already set', async () => {
    const { access, applyEnv } = makeTestbed()
    const vault = await access.initVault('password-123')
    setSecret(vault.data, DEFAULT_GROUP, 'TAKEN', 'vault-value')

    const envPath = join(dir, '.env')
    writeFileSync(envPath, 'TAKEN=local-value\n')

    const result = applyEnv.applyAll(vault, DEFAULT_GROUP, envPath, true)
    expect(result.applied).toEqual(['TAKEN'])
    expect(result.skipped).toEqual([])
    expect(readFileSync(envPath, 'utf8')).toBe('TAKEN=vault-value\n')
  })
})

describe('applyOne use case', () => {
  test('safe mode returns skipped for a set variable; force applies', async () => {
    const { access, applyEnv } = makeTestbed()
    const vault = await access.initVault('password-123')
    setSecret(vault.data, DEFAULT_GROUP, 'TAKEN', 'vault-value')

    const envPath = join(dir, '.env')
    writeFileSync(envPath, 'TAKEN=local-value\n')

    expect(applyEnv.applyOne(vault, DEFAULT_GROUP, 'TAKEN', envPath)).toBe('skipped')
    expect(readFileSync(envPath, 'utf8')).toBe('TAKEN=local-value\n')

    expect(applyEnv.applyOne(vault, DEFAULT_GROUP, 'TAKEN', envPath, true)).toBe('applied')
    expect(readFileSync(envPath, 'utf8')).toBe('TAKEN=vault-value\n')
  })

  test('safe mode still fills an empty variable', async () => {
    const { access, applyEnv } = makeTestbed()
    const vault = await access.initVault('password-123')
    setSecret(vault.data, DEFAULT_GROUP, 'EMPTY', 'filled')

    const envPath = join(dir, '.env')
    writeFileSync(envPath, 'EMPTY=\n')
    expect(applyEnv.applyOne(vault, DEFAULT_GROUP, 'EMPTY', envPath)).toBe('applied')
    expect(readFileSync(envPath, 'utf8')).toBe('EMPTY=filled\n')
  })
})

describe('applyTemplate use case', () => {
  test('writes the target from the template, template untouched', async () => {
    const { access, applyEnv } = makeTestbed()
    const vault = await access.initVault('password-123')
    setSecret(vault.data, DEFAULT_GROUP, 'DB', 'real')

    const template = join(dir, '.env.example')
    const target = join(dir, '.env')
    const templateContent = '# header\nDB=placeholder\nUNKNOWN=keep\n'
    writeFileSync(template, templateContent)

    const result = applyEnv.applyTemplate(vault, DEFAULT_GROUP, template, target)
    expect(result.applied).toEqual(['DB'])
    expect(result.missing).toEqual(['UNKNOWN'])
    expect(readFileSync(target, 'utf8')).toBe('# header\nDB=real\nUNKNOWN=keep\n')
    expect(readFileSync(template, 'utf8')).toBe(templateContent)
    // A freshly created target holds plaintext secrets — owner-only access.
    expect(statSync(target).mode & 0o777).toBe(0o600)
    expect(existsSync(target + '.tmp')).toBe(false)
  })

  test('writing keeps the mode the user gave an existing file', async () => {
    const { access, applyEnv } = makeTestbed()
    const vault = await access.initVault('password-123')
    setSecret(vault.data, DEFAULT_GROUP, 'DB', 'real')

    const envPath = join(dir, '.env')
    writeFileSync(envPath, 'DB=old\n', { mode: 0o644 })

    applyEnv.applyAll(vault, DEFAULT_GROUP, envPath, true)
    expect(readFileSync(envPath, 'utf8')).toBe('DB=real\n')
    expect(statSync(envPath).mode & 0o777).toBe(0o644)
  })

  test('safe mode keeps non-empty values already in the target', async () => {
    const { access, applyEnv } = makeTestbed()
    const vault = await access.initVault('password-123')
    setSecret(vault.data, DEFAULT_GROUP, 'DB', 'vault-db')
    setSecret(vault.data, DEFAULT_GROUP, 'FRESH', 'vault-fresh')

    const template = join(dir, '.env.example')
    const target = join(dir, '.env')
    writeFileSync(template, 'DB=placeholder\nFRESH=\nMANUAL=\n')
    writeFileSync(target, 'DB=local-db\nMANUAL=hand-set\n')

    const result = applyEnv.applyTemplate(vault, DEFAULT_GROUP, template, target)
    expect(result.applied).toEqual(['FRESH'])
    expect(result.skipped).toEqual(['DB'])
    expect(result.missing).toEqual(['MANUAL'])
    expect(readFileSync(target, 'utf8')).toBe('DB=local-db\nFRESH=vault-fresh\nMANUAL=hand-set\n')
  })

  test('force regenerates the target from the vault', async () => {
    const { access, applyEnv } = makeTestbed()
    const vault = await access.initVault('password-123')
    setSecret(vault.data, DEFAULT_GROUP, 'DB', 'vault-db')

    const template = join(dir, '.env.example')
    const target = join(dir, '.env')
    writeFileSync(template, 'DB=placeholder\n')
    writeFileSync(target, 'DB=local-db\n')

    const result = applyEnv.applyTemplate(vault, DEFAULT_GROUP, template, target, true)
    expect(result.applied).toEqual(['DB'])
    expect(readFileSync(target, 'utf8')).toBe('DB=vault-db\n')
  })
})

describe('scan use cases (planImport/importEntries)', () => {
  test('plan classifies add/replace/unchanged/conflicts', async () => {
    const { access, secrets } = makeTestbed()
    const vault = await access.initVault('password-123')
    setSecret(vault.data, DEFAULT_GROUP, 'KEEP', 'same')
    setSecret(vault.data, DEFAULT_GROUP, 'OLD', 'old')
    setSecret(vault.data, DEFAULT_GROUP, 'HOLDER', 'x')
    addAliases(vault.data, DEFAULT_GROUP, 'HOLDER', ['TAKEN'])

    const entries = [
      { name: 'NEW', value: 'n' },
      { name: 'KEEP', value: 'same' },
      { name: 'OLD', value: 'updated' },
      { name: 'TAKEN', value: 'no' },
    ]
    const plan = secrets.planImport(vault, DEFAULT_GROUP, entries)
    expect(plan.add).toEqual(['NEW'])
    expect(plan.unchanged).toEqual(['KEEP'])
    expect(plan.replace).toEqual(['OLD'])
    expect(plan.conflicts).toEqual([{ name: 'TAKEN', owner: 'HOLDER' }])
  })

  test('importEntries applies only adds/replaces and persists once', async () => {
    const { access, secrets } = makeTestbed()
    const vault = await access.initVault('password-123')
    setSecret(vault.data, DEFAULT_GROUP, 'OLD', 'old')

    const { added, replaced } = await secrets.importEntries(vault, DEFAULT_GROUP, [
      { name: 'NEW', value: 'n' },
      { name: 'OLD', value: 'updated' },
    ])
    expect(added).toEqual(['NEW'])
    expect(replaced).toEqual(['OLD'])

    const reopened = await access.openWithPassword('password-123')
    expect(getSecret(reopened.data, DEFAULT_GROUP, 'NEW')?.value).toBe('n')
    expect(getSecret(reopened.data, DEFAULT_GROUP, 'OLD')?.value).toBe('updated')
  })
})
