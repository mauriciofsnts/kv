import QRCode from 'qrcode'
import { shareGroup } from '../../composition.ts'
import { confirmPrompt, hiddenPrompt } from './prompt.ts'
import { resolveGroup, unlockVault } from './unlock.ts'

// Beyond this the QR gets too dense to scan reliably off a terminal.
const MAX_QR_PAYLOAD = 1200

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
  console.log(`Sharing group "${group}" — ${names.length} secret${names.length === 1 ? '' : 's'}: ${names.join(', ')}`)
  console.log()

  if (payload.length > MAX_QR_PAYLOAD) {
    console.log(`(payload too large for a scannable QR — ${payload.length} chars; copy the text below instead)`)
  } else {
    const qr = await QRCode.toString(payload, {
      type: 'terminal',
      small: true,
      errorCorrectionLevel: 'L',
    })
    const qrWidth = qr.split('\n')[0]?.length ?? 0
    const termWidth = process.stdout.columns || 80
    if (qrWidth > termWidth) {
      console.log(`(QR needs ${qrWidth} columns but the terminal has ${termWidth} — widen it and run again, or copy the text below)`)
    } else {
      console.log(qr)
    }
  }

  console.log('Payload (same content as the QR):')
  console.log(payload)
  console.log()
  console.log(`One-time code:  ${code}`)
  console.log()
  console.log('On the other machine: `key import`, paste the payload, then type the code.')
  console.log('Send the code through a different channel than the QR/payload.')
}

export async function cmdImport(payloadArg: string | undefined, groupFlag?: string): Promise<void> {
  let payload = payloadArg
  if (!payload) {
    process.stderr.write('Paste the share payload: ')
    for await (const line of console) {
      payload = line.trim()
      break
    }
  }
  if (!payload) {
    console.error('No payload given.')
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
  console.log(`Share contains ${names.length} secret${names.length === 1 ? '' : 's'} from group "${share.group}": ${names.join(', ')}`)
  if (!(await confirmPrompt(`Import into group "${targetGroup}"?`))) {
    console.log('Nothing imported.')
    return
  }

  const vault = await unlockVault()
  const { added, replaced, skipped } = await shareGroup.importShare(vault, targetGroup, share)
  const parts: string[] = []
  if (added.length > 0) parts.push(`+ ${added.length} added (${added.join(', ')})`)
  if (replaced.length > 0) parts.push(`~ ${replaced.length} replaced (${replaced.join(', ')})`)
  if (parts.length === 0) parts.push('nothing imported')
  console.log(`✓ ${parts.join(' · ')} [group: ${targetGroup}]`)
  for (const { name, owner } of skipped) {
    console.error(`✗ "${name}" skipped: it is an alias of "${owner}" here.`)
  }
}
