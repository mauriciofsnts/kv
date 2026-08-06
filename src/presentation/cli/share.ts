import { shareGroup } from '../../composition.ts'
import { confirmPrompt, hiddenPrompt, readLine } from './prompt.ts'
import { ui, uiErr } from './ui.ts'
import { resolveGroup, unlockVault } from './unlock.ts'

export async function cmdShare(groupArg: string | undefined, groupFlag?: string): Promise<void> {
  const vault = await unlockVault()
  const group = groupArg ?? resolveGroup(groupFlag)

  let share: ReturnType<typeof shareGroup.createShare>
  try {
    share = shareGroup.createShare(vault, group)
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }
  const { payload, code, names } = share
  console.log(
    `Sharing group "${ui.bold(ui.cyan(group))}" — ${names.length} secret${names.length === 1 ? '' : 's'}: ${names.join(', ')}`,
  )
  console.log()
  console.log(ui.dim('Payload:'))
  console.log(payload)
  console.log()
  console.log(`One-time code:  ${ui.bold(ui.yellow(code))}`)
  console.log()
  console.log(ui.dim('On the other machine: `kv import`, paste the payload, then type the code.'))
  console.log(ui.dim('Send the code through a different channel than the payload.'))
}

export async function cmdImport(payloadArg: string | undefined, groupFlag?: string): Promise<void> {
  let payload = payloadArg
  if (!payload) {
    process.stderr.write(uiErr.cyan('? ') + uiErr.bold('Paste the share payload: '))
    payload = (await readLine()).trim()
  }
  if (!payload) {
    console.error(uiErr.bad('No payload given.'))
    process.exit(1)
  }

  const code = await hiddenPrompt('One-time code: ')
  let share: ReturnType<typeof shareGroup.decodeShare>
  try {
    share = shareGroup.decodeShare(payload, code)
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }

  const names = Object.keys(share.secrets)
  const targetGroup = groupFlag ?? share.group
  console.log(
    `Share contains ${names.length} secret${names.length === 1 ? '' : 's'} from group "${ui.bold(ui.cyan(share.group))}": ${names.join(', ')}`,
  )
  if (!(await confirmPrompt(`Import into group "${targetGroup}"?`))) {
    console.log(ui.dim('Nothing imported.'))
    return
  }

  const vault = await unlockVault()
  const { added, replaced, skipped } = await shareGroup.importShare(vault, targetGroup, share)
  const parts: string[] = []
  if (added.length > 0) parts.push(`${added.length} added ${ui.dim(`(${added.join(', ')})`)}`)
  if (replaced.length > 0) parts.push(`${replaced.length} replaced ${ui.dim(`(${replaced.join(', ')})`)}`)
  if (parts.length === 0) parts.push('nothing imported')
  console.log(ui.ok(parts.join(ui.dim(' · '))) + ui.group(targetGroup))
  for (const { name, owner } of skipped) {
    console.error(uiErr.bad(`"${name}" skipped: it is an alias of "${owner}" here.`))
  }
}
