// The `key apply` flow: fill real values into a .env file, resolving
// canonical names and aliases alike, preserving the file's formatting.
import {
  type EnvEntry,
  appendEnvVar,
  listEnvVars,
  parseEnvEntries,
  setEnvValue,
} from '../../domain/env-file.ts'
import { listSecrets, resolveSecret } from '../../domain/secret.ts'
import type { EnvFileGateway } from '../ports.ts'
import type { Vault } from '../vault.ts'

export interface ApplyAllResult {
  applied: string[]
  // Safe mode (no --force): variables whose file value is non-empty and
  // different from the vault's are left alone.
  skipped: string[]
  missing: string[]
}

export interface EnvDiff {
  // Names only — values never leave this function.
  inSync: string[]
  differs: string[]
  missingFromVault: string[]
  notInEnv: string[]
}

export function makeApplyEnv(envFiles: EnvFileGateway) {
  return {
    envFileExists(path: string): boolean {
      return envFiles.exists(path)
    },

    applyAll(vault: Vault, group: string, envPath: string, force = false): ApplyAllResult {
      let content = envFiles.read(envPath)
      const current = new Map(parseEnvEntries(content).map((e) => [e.name, e.value]))
      const applied: string[] = []
      const skipped: string[] = []
      const missing: string[] = []
      for (const { name } of listEnvVars(content)) {
        const resolved = resolveSecret(vault.data, group, name)
        if (!resolved) {
          missing.push(name)
        } else if (!force && isSetToOtherValue(current.get(name), resolved.secret.value)) {
          skipped.push(name)
        } else {
          content = setEnvValue(content, name, resolved.secret.value).content
          applied.push(name)
        }
      }
      envFiles.write(envPath, content)
      return { applied, skipped, missing }
    },

    // 'applied' when the variable existed and was replaced; 'skipped' when it
    // already holds a different non-empty value and force is off; 'not-in-env'
    // when the vault knows the secret but the file lacks the variable
    // (the caller decides whether to append). Throws when the secret is
    // missing from the vault.
    applyOne(
      vault: Vault,
      group: string,
      name: string,
      envPath: string,
      force = false,
    ): 'applied' | 'skipped' | 'not-in-env' {
      const resolved = resolveSecret(vault.data, group, name)
      if (!resolved) {
        throw new Error(`"${name}" does not exist in group "${group}" of the vault.`)
      }
      const content = envFiles.read(envPath)
      if (!force) {
        const current = parseEnvEntries(content).find((e) => e.name === name)?.value
        if (isSetToOtherValue(current, resolved.secret.value)) return 'skipped'
      }
      const result = setEnvValue(content, name, resolved.secret.value)
      if (!result.found) return 'not-in-env'
      envFiles.write(envPath, result.content)
      return 'applied'
    },

    appendOne(vault: Vault, group: string, name: string, envPath: string): void {
      const resolved = resolveSecret(vault.data, group, name)
      if (!resolved) {
        throw new Error(`"${name}" does not exist in group "${group}" of the vault.`)
      }
      envFiles.write(envPath, appendEnvVar(envFiles.read(envPath), name, resolved.secret.value))
    },

    // Template mode: fill every variable of `templatePath` from the vault
    // and write the result to `targetPath`, leaving the template untouched.
    // Safe mode: non-empty values already present in the target survive the
    // regeneration (their variables are reported as skipped).
    applyTemplate(
      vault: Vault,
      group: string,
      templatePath: string,
      targetPath: string,
      force = false,
    ): ApplyAllResult {
      let content = envFiles.read(templatePath)
      const existing =
        !force && envFiles.exists(targetPath)
          ? new Map(parseEnvEntries(envFiles.read(targetPath)).map((e) => [e.name, e.value]))
          : new Map<string, string>()
      const applied: string[] = []
      const skipped: string[] = []
      const missing: string[] = []
      for (const { name } of listEnvVars(content)) {
        const resolved = resolveSecret(vault.data, group, name)
        const current = existing.get(name)
        if (!resolved) {
          // Not in the vault, but a value the user set by hand still survives.
          if (current) content = setEnvValue(content, name, current).content
          missing.push(name)
        } else if (isSetToOtherValue(current, resolved.secret.value)) {
          content = setEnvValue(content, name, current!).content
          skipped.push(name)
        } else {
          content = setEnvValue(content, name, resolved.secret.value).content
          applied.push(name)
        }
      }
      envFiles.write(targetPath, content)
      return { applied, skipped, missing }
    },

    // Drift report between a .env file and the vault. Compares values but
    // only ever returns names.
    diff(vault: Vault, group: string, envPath: string): EnvDiff {
      const entries = parseEnvEntries(envFiles.read(envPath))
      const envNames = new Set(entries.map((e) => e.name))
      const result: EnvDiff = { inSync: [], differs: [], missingFromVault: [], notInEnv: [] }
      for (const { name, value } of entries) {
        const resolved = resolveSecret(vault.data, group, name)
        if (!resolved) result.missingFromVault.push(name)
        else if (resolved.secret.value === value) result.inSync.push(name)
        else result.differs.push(name)
      }
      for (const [name, secret] of listSecrets(vault.data, group)) {
        const present = envNames.has(name) || secret.aliases?.some((a) => envNames.has(a))
        if (!present) result.notInEnv.push(name)
      }
      return result
    },

    readEntries(envPath: string): EnvEntry[] {
      return parseEnvEntries(envFiles.read(envPath))
    },
  }
}

export type ApplyEnv = ReturnType<typeof makeApplyEnv>

// Safe mode's overwrite guard: a value blocks the apply only when it is
// non-empty and different from the vault's (rewriting an equal value is a
// no-op, so it still counts as applied).
function isSetToOtherValue(current: string | undefined, vaultValue: string): boolean {
  return current !== undefined && current !== '' && current !== vaultValue
}
