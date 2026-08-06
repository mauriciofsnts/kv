import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// `kv use` is exercised through the real CLI entrypoint, same approach as
// tests/completions.test.ts: it's the actual contract users run.
let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'key-use-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

async function runKey(
  args: string[],
  opts: { stdin?: string; cwd?: string } = {},
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(['bun', 'run', join(import.meta.dir, '../src/index.ts'), ...args], {
    cwd: opts.cwd ?? dir,
    env: {
      ...process.env,
      KV_VAULT_PATH: join(dir, 'vault.enc'),
      KV_SESSION_PATH: join(dir, 'session'),
      XDG_CONFIG_HOME: join(dir, 'config'),
    },
    stdin: opts.stdin ? new TextEncoder().encode(opts.stdin) : undefined,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  return { stdout, stderr, exitCode: await proc.exited }
}

describe('kv use', () => {
  test('with no group shows the active group and its source', async () => {
    await runKey(['init'], { stdin: 'testpass123\ntestpass123\n' })
    const shown = await runKey(['use'])
    expect(shown.stdout).toContain('default')
    expect(shown.stdout).toContain('no .kv marker here')
  })

  test('pins an existing group by writing a .kv marker', async () => {
    await runKey(['init'], { stdin: 'testpass123\ntestpass123\n' })
    await runKey(['set', 'API_KEY', '-g', 'backend'], { stdin: 'value\n' })

    const used = await runKey(['use', 'backend'])
    expect(used.stdout).toContain('backend')
    expect(readFileSync(join(dir, '.kv'), 'utf8').trim()).toBe('backend')

    // Subsequent commands in this directory pick it up without --group.
    const got = await runKey(['get', 'API_KEY'])
    expect(got.stdout.trim()).toBe('value')

    const shown = await runKey(['use'])
    expect(shown.stdout).toContain('pinned in')
    expect(shown.stdout).toContain('.kv')
  })

  test('offers to create a group that does not exist yet', async () => {
    await runKey(['init'], { stdin: 'testpass123\ntestpass123\n' })

    const declined = await runKey(['use', 'new-project'], { stdin: 'n\n' })
    expect(declined.exitCode).toBe(0)
    expect(existsSync(join(dir, '.kv'))).toBe(false)

    const accepted = await runKey(['use', 'new-project'], { stdin: 'y\n' })
    expect(accepted.exitCode).toBe(0)
    expect(readFileSync(join(dir, '.kv'), 'utf8').trim()).toBe('new-project')

    const list = await runKey(['list'])
    expect(list.stdout).toContain('new-project')
  })

  test('re-pins into an existing legacy .key marker instead of adding a .kv one', async () => {
    await runKey(['init'], { stdin: 'testpass123\ntestpass123\n' })
    await runKey(['set', 'API_KEY', '-g', 'backend'], { stdin: 'value\n' })
    writeFileSync(join(dir, '.key'), 'default\n')

    await runKey(['use', 'backend'])
    expect(readFileSync(join(dir, '.key'), 'utf8').trim()).toBe('backend')
    expect(existsSync(join(dir, '.kv'))).toBe(false)
  })

  test('a stale .kv marker names itself and `kv use` in the error, unlike a typo in --group', async () => {
    await runKey(['init'], { stdin: 'testpass123\ntestpass123\n' })
    writeFileSync(join(dir, '.kv'), 'ghost-group\n')
    writeFileSync(join(dir, '.env'), 'FOO=x\n')

    const fromMarker = await runKey(['apply', 'all'])
    expect(fromMarker.exitCode).toBe(1)
    expect(fromMarker.stderr).toContain('ghost-group')
    expect(fromMarker.stderr).toContain('.kv')
    expect(fromMarker.stderr).toContain('kv use')

    const fromFlag = await runKey(['apply', 'all', '-g', 'typo-group'])
    expect(fromFlag.exitCode).toBe(1)
    expect(fromFlag.stderr).toContain('typo-group')
    expect(fromFlag.stderr).not.toContain('kv use')
  })
})
