// The `key apply` flow: fill real values into a .env file, resolving
// canonical names and aliases alike, preserving the file's formatting.
import { appendEnvVar, listEnvVars, setEnvValue } from '../../domain/env-file.ts'
import { resolveSecret } from '../../domain/secret.ts'
import type { EnvFileGateway } from '../ports.ts'
import type { Vault } from '../vault.ts'

export interface ApplyAllResult {
  applied: string[]
  missing: string[]
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
  }
}

export type ApplyEnv = ReturnType<typeof makeApplyEnv>
