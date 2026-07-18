import { config } from '../../composition.ts'
import { ui, uiErr } from './ui.ts'

// kv config                 → show the persisted settings
// kv config force <on|off>  → make `kv apply` overwrite existing values by
//                              default (no more -f), or restore safe mode.
export async function cmdConfig(args: string[]): Promise<void> {
  const [setting, value] = args

  if (!setting) {
    console.log(`${ui.dim('force apply:')} ${config.forceApply() ? ui.yellow('on') : ui.green('off')}`)
    if (process.env.KV_FORCE_APPLY !== undefined) {
      console.log(ui.dim('note:        set via KV_FORCE_APPLY (overrides config.json)'))
    }
    return
  }

  if (setting !== 'force') {
    console.error(uiErr.bad(`Unknown setting: ${setting}`) + '\nUsage: kv config [force <on|off>]')
    process.exit(1)
  }

  if (value !== 'on' && value !== 'off') {
    console.error('Usage: kv config force <on|off>')
    process.exit(1)
  }

  config.setForceApply(value === 'on')
  if (value === 'on') {
    console.log(ui.ok('Force apply enabled: `kv apply` now overwrites existing values ') + ui.dim('(use --safe to skip them).'))
  } else {
    console.log(ui.ok('Force apply disabled: `kv apply` skips variables that already have a value ') + ui.dim('(use -f to overwrite).'))
  }
}
