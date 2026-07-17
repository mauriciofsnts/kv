// CryptoProvider backed by node:crypto: scrypt KDF + AES-256-GCM.
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'
import type { CryptoProvider, EncryptedEnvelope, KdfParams } from '../../application/ports.ts'
import { WrongPasswordError } from '../../domain/errors.ts'

const KEY_LENGTH = 32
const IV_LENGTH = 12
const SALT_LENGTH = 16

export const SCRYPT_PARAMS: { N: number; r: number; p: number } = { N: 32768, r: 8, p: 1 }

export const nodeCrypto: CryptoProvider = {
  newKdfParams(): KdfParams {
    return {
      algo: 'scrypt',
      salt: randomBytes(SALT_LENGTH).toString('base64'),
      ...SCRYPT_PARAMS,
    }
  },

  deriveKey(password: string, kdf: KdfParams): Buffer {
    return scryptSync(password, Buffer.from(kdf.salt, 'base64'), KEY_LENGTH, {
      N: kdf.N,
      r: kdf.r,
      p: kdf.p,
      maxmem: 128 * kdf.N * kdf.r * 2,
    })
  },

  encrypt(plaintext: string, key: Buffer, kdf: KdfParams): EncryptedEnvelope {
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
  },

  decrypt(envelope: EncryptedEnvelope, key: Buffer): string {
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
  },
}
