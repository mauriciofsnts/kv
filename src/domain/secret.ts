// Entities and pure business rules for secrets, groups and aliases.
// No I/O, no crypto, no framework — functions operate on plain VaultData.

export interface Secret {
  value: string
  updatedAt: string
  note?: string
  // Alternative env var names that resolve to this secret's value
  // (e.g. DB_URL and POSTGRES_URL sharing the same connection string).
  aliases?: string[]
}

export interface VaultData {
  groups: Record<string, Record<string, Secret>>
}

export const DEFAULT_GROUP = 'default'

export const NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

export function emptyVaultData(): VaultData {
  return { groups: { [DEFAULT_GROUP]: {} } }
}

export function setSecret(
  data: VaultData,
  group: string,
  name: string,
  value: string,
  note?: string,
  aliases?: string[],
): void {
  data.groups[group] ??= {}
  const previous = data.groups[group][name]
  data.groups[group][name] = {
    value,
    updatedAt: new Date().toISOString(),
    ...(note ? { note } : {}),
    ...(aliases !== undefined
      ? aliases.length > 0
        ? { aliases }
        : {}
      : previous?.aliases?.length
        ? { aliases: previous.aliases }
        : {}),
  }
}

export function getSecret(data: VaultData, group: string, name: string): Secret | undefined {
  return data.groups[group]?.[name]
}

// Resolves a name to a secret, matching either the canonical name or any of
// its aliases. Returns the canonical name alongside the secret.
export function resolveSecret(
  data: VaultData,
  group: string,
  name: string,
): { name: string; secret: Secret } | undefined {
  const groupSecrets = data.groups[group]
  if (!groupSecrets) return undefined
  const direct = groupSecrets[name]
  if (direct) return { name, secret: direct }
  for (const [canonical, secret] of Object.entries(groupSecrets)) {
    if (secret.aliases?.includes(name)) return { name: canonical, secret }
  }
  return undefined
}

// Canonical name that owns `name` in the group, either directly or as an
// alias — used to detect collisions before adding names/aliases.
export function ownerOfName(data: VaultData, group: string, name: string): string | undefined {
  return resolveSecret(data, group, name)?.name
}

export function addAliases(
  data: VaultData,
  group: string,
  name: string,
  aliases: string[],
): { added: string[]; conflicts: { alias: string; owner: string }[] } {
  const secret = getSecret(data, group, name)
  if (!secret) throw new Error(`"${name}" does not exist in group "${group}".`)
  const added: string[] = []
  const conflicts: { alias: string; owner: string }[] = []
  for (const alias of aliases) {
    const owner = ownerOfName(data, group, alias)
    if (owner === name) continue
    if (owner) {
      conflicts.push({ alias, owner })
      continue
    }
    secret.aliases = [...(secret.aliases ?? []), alias]
    added.push(alias)
  }
  if (added.length > 0) secret.updatedAt = new Date().toISOString()
  return { added, conflicts }
}

export function removeAliases(
  data: VaultData,
  group: string,
  name: string,
  aliases: string[],
): string[] {
  const secret = getSecret(data, group, name)
  if (!secret) throw new Error(`"${name}" does not exist in group "${group}".`)
  const removed = (secret.aliases ?? []).filter((a) => aliases.includes(a))
  if (removed.length > 0) {
    const remaining = (secret.aliases ?? []).filter((a) => !aliases.includes(a))
    if (remaining.length > 0) secret.aliases = remaining
    else delete secret.aliases
    secret.updatedAt = new Date().toISOString()
  }
  return removed
}

// Deletes `source` and re-registers its name — plus everything that aliased
// it — as aliases of `target`, so every old name keeps resolving. `source`'s
// value is discarded by design; confirming that is the caller's job.
export function mergeAsAlias(
  data: VaultData,
  group: string,
  source: string,
  target: string,
): string[] {
  const sourceSecret = getSecret(data, group, source)
  if (!sourceSecret) throw new Error(`"${source}" does not exist in group "${group}".`)
  const resolved = resolveSecret(data, group, target)
  if (!resolved) throw new Error(`"${target}" does not exist in group "${group}".`)
  if (resolved.name === source) throw new Error(`Cannot move "${source}" onto itself.`)
  const moved = [source, ...(sourceSecret.aliases ?? [])]
  removeSecret(data, group, source)
  resolved.secret.aliases = [...(resolved.secret.aliases ?? []), ...moved]
  resolved.secret.updatedAt = new Date().toISOString()
  return moved
}

export function removeSecret(data: VaultData, group: string, name: string): boolean {
  const groupSecrets = data.groups[group]
  if (!groupSecrets || !(name in groupSecrets)) return false
  delete groupSecrets[name]
  return true
}

export function createGroup(data: VaultData, group: string): void {
  data.groups[group] ??= {}
}

// Environment variable map for a group: canonical names plus every alias,
// all pointing at the secret's value — what `kv run` injects.
export function groupEnvMap(data: VaultData, group: string): Record<string, string> {
  const map: Record<string, string> = {}
  for (const [name, secret] of Object.entries(data.groups[group] ?? {})) {
    map[name] = secret.value
    for (const alias of secret.aliases ?? []) map[alias] = secret.value
  }
  return map
}

export function listGroups(data: VaultData): string[] {
  return Object.keys(data.groups).sort()
}

export function listSecrets(data: VaultData, group: string): [string, Secret][] {
  return Object.entries(data.groups[group] ?? {}).sort(([a], [b]) => a.localeCompare(b))
}

export function removeGroup(data: VaultData, group: string): boolean {
  if (!(group in data.groups) || group === DEFAULT_GROUP) return false
  delete data.groups[group]
  return true
}
