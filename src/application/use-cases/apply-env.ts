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

    applyAll(vault: Vault, group: string, envPath: string): ApplyAllResult {
      let content = envFiles.read(envPath)
      const applied: string[] = []
      const missing: string[] = []
      for (const { name } of listEnvVars(content)) {
        const resolved = resolveSecret(vault.data, group, name)
        if (resolved) {
          content = setEnvValue(content, name, resolved.secret.value).content
          applied.push(name)
        } else {
          missing.push(name)
        }
      }
      envFiles.write(envPath, content)
      return { applied, missing }
    },

    // 'applied' when the variable existed and was replaced; 'not-in-env'
    // when the vault knows the secret but the file lacks the variable
    // (the caller decides whether to append). Throws when the secret is
    // missing from the vault.
    applyOne(vault: Vault, group: string, name: string, envPath: string): 'applied' | 'not-in-env' {
      const resolved = resolveSecret(vault.data, group, name)
      if (!resolved) {
        throw new Error(`"${name}" does not exist in group "${group}" of the vault.`)
      }
      const content = envFiles.read(envPath)
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
    applyTemplate(
      vault: Vault,
      group: string,
      templatePath: string,
      targetPath: string,
    ): ApplyAllResult {
      let content = envFiles.read(templatePath)
      const applied: string[] = []
      const missing: string[] = []
      for (const { name } of listEnvVars(content)) {
        const resolved = resolveSecret(vault.data, group, name)
        if (resolved) {
          content = setEnvValue(content, name, resolved.secret.value).content
          applied.push(name)
        } else {
          missing.push(name)
        }
      }
      envFiles.write(targetPath, content)
      return { applied, missing }
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
