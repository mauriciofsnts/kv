import { config } from '../../composition.ts'

// key config                 → show the persisted settings
// key config force <on|off>  → make `key apply` overwrite existing values by
//                              default (no more -f), or restore safe mode.
export async function cmdConfig(args: string[]): Promise<void> {
  const [setting, value] = args

  if (!setting) {
    console.log(`force apply: ${config.forceApply() ? 'on' : 'off'}`)
    if (process.env.KEY_FORCE_APPLY !== undefined) {
      console.log('note:        set via KEY_FORCE_APPLY (overrides config.json)')
    }
    return
  }

  if (setting !== 'force') {
    console.error(`Unknown setting: ${setting}\nUsage: key config [force <on|off>]`)
    process.exit(1)
  }

  if (value !== 'on' && value !== 'off') {
    console.error('Usage: key config force <on|off>')
    process.exit(1)
  }

  config.setForceApply(value === 'on')
  if (value === 'on') {
    console.log('✓ Force apply enabled: `key apply` now overwrites existing values (use --safe to skip them).')
  } else {
    console.log('✓ Force apply disabled: `key apply` skips variables that already have a value (use -f to overwrite).')
  }
}
