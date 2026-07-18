import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Completion is exercised through the real CLI entrypoint: the shell scripts
// call `key __complete …` as a subprocess, so that is the contract to test.
let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'key-completions-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

async function runKey(
  args: string[],
  opts: { stdin?: string; cwd?: string } = {},
): Promise<{ stdout: string; exitCode: number }> {
  const proc = Bun.spawn(['bun', 'run', join(import.meta.dir, '../src/index.ts'), ...args], {
    cwd: opts.cwd ?? dir,
    env: {
      ...process.env,
      KEY_VAULT_PATH: join(dir, 'vault.enc'),
      KEY_SESSION_PATH: join(dir, 'session'),
      XDG_CONFIG_HOME: join(dir, 'config'),
    },
    stdin: opts.stdin ? new TextEncoder().encode(opts.stdin) : undefined,
    stdout: 'pipe',
    stderr: 'ignore',
  })
  const stdout = await new Response(proc.stdout).text()
  return { stdout, exitCode: await proc.exited }
}

const lines = (out: string) => out.split('\n').filter(Boolean)

describe('key __complete', () => {
  test('lists groups and names (with aliases) from the session', async () => {
    await runKey(['init'], { stdin: 'testpass123\ntestpass123\n' })
    await runKey(['set', 'DATABASE_URL'], { stdin: 'value\n' })
    await runKey(['set', 'API_KEY', '-g', 'backend'], { stdin: 'value\n' })
    await runKey(['alias', 'add', 'DATABASE_URL', 'DB_URL'])

    const groups = await runKey(['__complete', 'groups'])
    expect(lines(groups.stdout).sort()).toEqual(['backend', 'default'])

    const names = await runKey(['__complete', 'names'])
    expect(lines(names.stdout).sort()).toEqual(['DATABASE_URL', 'DB_URL'])

    const backend = await runKey(['__complete', 'names', '--group', 'backend'])
    expect(lines(backend.stdout)).toEqual(['API_KEY'])
  })

  test('is silent with exit 0 when locked or when there is no vault', async () => {
    await runKey(['init'], { stdin: 'testpass123\ntestpass123\n' })
    await runKey(['lock'])
    const locked = await runKey(['__complete', 'names'])
    expect(locked.stdout).toBe('')
    expect(locked.exitCode).toBe(0)

    rmSync(join(dir, 'vault.enc'), { force: true })
    const missing = await runKey(['__complete', 'groups'])
    expect(missing.stdout).toBe('')
    expect(missing.exitCode).toBe(0)
  })

  test('respects the .key group marker for names', async () => {
    await runKey(['init'], { stdin: 'testpass123\ntestpass123\n' })
    await runKey(['set', 'API_KEY', '-g', 'backend'], { stdin: 'value\n' })
    writeFileSync(join(dir, '.key'), 'backend\n')
    const names = await runKey(['__complete', 'names'])
    expect(lines(names.stdout)).toEqual(['API_KEY'])
  })
})

describe('key completions', () => {
  test('prints a script per shell and rejects unknown shells', async () => {
    expect((await runKey(['completions', 'zsh'])).stdout).toStartWith('#compdef key')
    expect((await runKey(['completions', 'bash'])).stdout).toContain(
      'complete -F _key_completions key',
    )
    expect((await runKey(['completions', 'fish'])).stdout).toContain('complete -c key')
    expect((await runKey(['completions', 'powershell'])).exitCode).toBe(1)
  })
})
