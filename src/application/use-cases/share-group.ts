// Sharing a group of secrets out-of-band (QR code, chat, ...): the payload
// is the group's secrets gzipped and encrypted with a one-time share code.
// Whoever gets the payload learns nothing without the code, so the QR/text
// and the code should travel through different channels.
//
// Payload format v1 (also the wire contract for `key import`):
//   "keyshare1:" + base64url( salt(16) | iv(12) | tag(16) | ciphertext )
// KDF is fixed to scrypt N=32768 r=8 p=1 — part of the format, independent
// of whatever the vault itself uses.
import { gunzipSync, gzipSync } from 'node:zlib'
import { WrongPasswordError } from '../../domain/errors.ts'
import { type Secret, getSecret, listSecrets, ownerOfName, setSecret } from '../../domain/secret.ts'
import type { CryptoProvider, KdfParams } from '../ports.ts'
import type { Vault } from '../vault.ts'
import type { VaultAccess } from './vault-access.ts'

const PREFIX = 'keyshare1:'
const SHARE_KDF: Omit<KdfParams, 'salt'> = { algo: 'scrypt', N: 32768, r: 8, p: 1 }
const SALT_LENGTH = 16
// Crockford-style base32: no I/L/O/U/0/1 lookalikes. 16 chars ≈ 80 bits.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789'
const CODE_LENGTH = 16

export interface SharePayload {
  v: 1
  group: string
  secrets: Record<string, { value: string; note?: string; aliases?: string[] }>
}

export interface ImportResult {
  added: string[]
  replaced: string[]
  // Names skipped because they collide with an alias of another secret.
  skipped: { name: string; owner: string }[]
}

// Dashes/spaces/case in the typed code are cosmetic.
export function normalizeShareCode(code: string): string {
  return code.replace(/[\s-]/g, '').toUpperCase()
}

export function makeShareGroup(
  crypto: CryptoProvider,
  access: Pick<VaultAccess, 'saveVault'>,
) {
  const deriveShareKey = (code: string, salt: string) =>
    crypto.deriveKey(normalizeShareCode(code), { ...SHARE_KDF, salt })

  return {
    createShare(
      vault: Vault,
      group: string,
    ): { payload: string; code: string; names: string[] } {
      const secrets = listSecrets(vault.data, group)
      if (secrets.length === 0) {
        throw new Error(`Group "${group}" is empty or does not exist.`)
      }
      const share: SharePayload = { v: 1, group, secrets: {} }
      for (const [name, secret] of secrets) {
        share.secrets[name] = {
          value: secret.value,
          ...(secret.note ? { note: secret.note } : {}),
          ...(secret.aliases?.length ? { aliases: secret.aliases } : {}),
        }
      }

      const code = generateCode(crypto)
      const salt = crypto.randomBytes(SALT_LENGTH).toString('base64')
      const key = deriveShareKey(code, salt)
      // latin1 keeps the gzip bytes intact through the string-based
      // CryptoProvider API (1 char = 1 byte).
      const compressed = gzipSync(JSON.stringify(share)).toString('latin1')
      const envelope = crypto.encrypt(compressed, key, { ...SHARE_KDF, salt })

      const bytes = Buffer.concat([
        Buffer.from(salt, 'base64'),
        Buffer.from(envelope.cipher.iv, 'base64'),
        Buffer.from(envelope.cipher.tag, 'base64'),
        Buffer.from(envelope.data, 'base64'),
      ])
      return {
        payload: PREFIX + bytes.toString('base64url'),
        code: formatCode(code),
        names: secrets.map(([name]) => name),
      }
    },

    decodeShare(payload: string, code: string): SharePayload {
      const trimmed = payload.trim()
      if (!trimmed.startsWith(PREFIX)) {
        throw new Error('Not a key share payload (expected it to start with "keyshare1:").')
      }
      const bytes = Buffer.from(trimmed.slice(PREFIX.length), 'base64url')
      if (bytes.length <= SALT_LENGTH + 12 + 16) {
        throw new Error('Share payload is truncated.')
      }
      const salt = bytes.subarray(0, SALT_LENGTH).toString('base64')
      const iv = bytes.subarray(SALT_LENGTH, SALT_LENGTH + 12).toString('base64')
      const tag = bytes.subarray(SALT_LENGTH + 12, SALT_LENGTH + 28).toString('base64')
      const data = bytes.subarray(SALT_LENGTH + 28).toString('base64')

      let compressed: string
      try {
        compressed = crypto.decrypt(
          { version: 1, kdf: { ...SHARE_KDF, salt }, cipher: { algo: 'aes-256-gcm', iv, tag }, data },
          deriveShareKey(code, salt),
        )
      } catch (err) {
        if (err instanceof WrongPasswordError) {
          throw new Error('Wrong share code or corrupted payload.')
        }
        throw err
      }
      const share = JSON.parse(
        gunzipSync(Buffer.from(compressed, 'latin1')).toString('utf8'),
      ) as SharePayload
      if (share.v !== 1 || typeof share.group !== 'string' || !share.secrets) {
        throw new Error('Unsupported share payload version.')
      }
      return share
    },

    async importShare(
      vault: Vault,
      targetGroup: string,
      share: SharePayload,
    ): Promise<ImportResult> {
      const result: ImportResult = { added: [], replaced: [], skipped: [] }
      for (const [name, secret] of Object.entries(share.secrets)) {
        const owner = ownerOfName(vault.data, targetGroup, name)
        if (owner && owner !== name) {
          result.skipped.push({ name, owner })
          continue
        }
        const existed = Boolean(getSecret(vault.data, targetGroup, name))
        // Incoming aliases that already belong to someone else are dropped.
        const aliases = (secret.aliases ?? []).filter((alias) => {
          const aliasOwner = ownerOfName(vault.data, targetGroup, alias)
          return !aliasOwner || aliasOwner === name
        })
        setSecret(vault.data, targetGroup, name, secret.value, secret.note, aliases)
        ;(existed ? result.replaced : result.added).push(name)
      }
      if (result.added.length > 0 || result.replaced.length > 0) {
        await access.saveVault(vault)
      }
      return result
    },
  }
}

function generateCode(crypto: CryptoProvider): string {
  // Rejection sampling: 256 % 30 ≠ 0, so a plain modulo would slightly
  // favor the first alphabet characters.
  const limit = 256 - (256 % CODE_ALPHABET.length)
  let code = ''
  while (code.length < CODE_LENGTH) {
    for (const byte of crypto.randomBytes(CODE_LENGTH)) {
      if (byte >= limit) continue
      code += CODE_ALPHABET[byte % CODE_ALPHABET.length]
      if (code.length === CODE_LENGTH) break
    }
  }
  return code
}

function formatCode(code: string): string {
  return code.match(/.{4}/g)!.join('-')
}

export type ShareGroup = ReturnType<typeof makeShareGroup>
