import { config } from '../../composition.ts'
import { ui, uiErr } from './ui.ts'

// key config                 → show the persisted settings
// key config force <on|off>  → make `key apply` overwrite existing values by
//                              default (no more -f), or restore safe mode.
export async function cmdConfig(args: string[]): Promise<void> {
  const [setting, value] = args

  if (!setting) {
    console.log(`${ui.dim('force apply:')} ${config.forceApply() ? ui.yellow('on') : ui.green('off')}`)
    if (process.env.KEY_FORCE_APPLY !== undefined) {
      console.log(ui.dim('note:        set via KEY_FORCE_APPLY (overrides config.json)'))
    }
    return
  }

  if (setting !== 'force') {
    console.error(uiErr.bad(`Unknown setting: ${setting}`) + '\nUsage: key config [force <on|off>]')
    process.exit(1)
  }

  if (value !== 'on' && value !== 'off') {
    console.error('Usage: key config force <on|off>')
    process.exit(1)
  }

  config.setForceApply(value === 'on')
  if (value === 'on') {
    console.log(ui.ok('Force apply enabled: `key apply` now overwrites existing values ') + ui.dim('(use --safe to skip them).'))
  } else {
    console.log(ui.ok('Force apply disabled: `key apply` skips variables that already have a value ') + ui.dim('(use -f to overwrite).'))
  }
}
