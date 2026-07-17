import { groupEnvMap } from '../../domain/secret.ts'
import { resolveGroup, unlockVault } from './unlock.ts'

// key run [-g group] -- <command...>: run a command with the group's
// secrets (canonical names + aliases) injected as environment variables.
// No .env file, no plaintext on disk.
export async function cmdRun(command: string[], groupFlag?: string): Promise<void> {
  if (command.length === 0) {
    console.error('Usage: key run [--group group] -- <command> [args...]')
    process.exit(1)
  }
  const vault = await unlockVault()
  const group = resolveGroup(groupFlag)
  if (!(group in vault.data.groups)) {
    console.error(`Group "${group}" does not exist in the vault.`)
    process.exit(1)
  }

  const env = groupEnvMap(vault.data, group)
  const count = Object.keys(env).length
  process.stderr.write(`key: injecting ${count} variable${count === 1 ? '' : 's'} [group: ${group}]\n`)

  const proc = Bun.spawn(command, {
    env: { ...process.env, ...env },
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  })
  process.exit(await proc.exited)
}
