import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto'

const KEY_LENGTH = 32
const IV_LENGTH = 12
const SALT_LENGTH = 16

export const SCRYPT_PARAMS: { N: number; r: number; p: number } = { N: 32768, r: 8, p: 1 }

export interface KdfParams {
  algo: 'scrypt'
  salt: string
  N: number
  r: number
  p: number
}

export interface EncryptedEnvelope {
  version: 1
  kdf: KdfParams
  cipher: { algo: 'aes-256-gcm'; iv: string; tag: string }
  data: string
}

export class WrongPasswordError extends Error {
  constructor() {
    super('Senha incorreta ou cofre corrompido (falha na autenticação)')
    this.name = 'WrongPasswordError'
  }
}

export function deriveKey(password: string, salt: Buffer, params = SCRYPT_PARAMS): Buffer {
  return scryptSync(password, salt, KEY_LENGTH, {
    N: params.N,
    r: params.r,
    p: params.p,
    maxmem: 128 * params.N * params.r * 2,
  })
}

export function newSalt(): Buffer {
  return randomBytes(SALT_LENGTH)
}

export function encrypt(plaintext: string, key: Buffer, kdf: KdfParams): EncryptedEnvelope {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return {
    version: 1,
    kdf,
    cipher: {
      algo: 'aes-256-gcm',
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
    },
    data: data.toString('base64'),
  }
}

export function decrypt(envelope: EncryptedEnvelope, key: Buffer): string {
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(envelope.cipher.iv, 'base64'),
  )
  decipher.setAuthTag(Buffer.from(envelope.cipher.tag, 'base64'))
  try {
    return Buffer.concat([
      decipher.update(Buffer.from(envelope.data, 'base64')),
      decipher.final(),
    ]).toString('utf8')
  } catch {
    throw new WrongPasswordError()
  }
}

export function keysEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b)
}
