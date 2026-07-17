import { describe, expect, test } from 'bun:test'
import {
  SCRYPT_PARAMS,
  WrongPasswordError,
  decrypt,
  deriveKey,
  encrypt,
  newSalt,
} from '../src/core/crypto.ts'

function kdfFor(salt: Buffer) {
  return { algo: 'scrypt' as const, salt: salt.toString('base64'), ...SCRYPT_PARAMS }
}

describe('crypto', () => {
  test('encrypt/decrypt roundtrip', () => {
    const salt = newSalt()
    const key = deriveKey('secret-password', salt)
    const envelope = encrypt('{"hello":"world"}', key, kdfFor(salt))
    expect(decrypt(envelope, key)).toBe('{"hello":"world"}')
  })

  test('wrong password fails GCM authentication', () => {
    const salt = newSalt()
    const key = deriveKey('right-password', salt)
    const envelope = encrypt('data', key, kdfFor(salt))
    const wrongKey = deriveKey('wrong-password', salt)
    expect(() => decrypt(envelope, wrongKey)).toThrow(WrongPasswordError)
  })

  test('tampered payload fails authentication', () => {
    const salt = newSalt()
    const key = deriveKey('password', salt)
    const envelope = encrypt('original data', key, kdfFor(salt))
    const tampered = Buffer.from(envelope.data, 'base64')
    tampered[0] = tampered[0]! ^ 0xff
    envelope.data = tampered.toString('base64')
    expect(() => decrypt(envelope, key)).toThrow(WrongPasswordError)
  })

  test('fresh IV on every encrypt', () => {
    const salt = newSalt()
    const key = deriveKey('password', salt)
    const a = encrypt('x', key, kdfFor(salt))
    const b = encrypt('x', key, kdfFor(salt))
    expect(a.cipher.iv).not.toBe(b.cipher.iv)
    expect(a.data).not.toBe(b.data)
  })

  test('same password + same salt = same key; different salts differ', () => {
    const salt = newSalt()
    const k1 = deriveKey('password', salt)
    const k2 = deriveKey('password', salt)
    const k3 = deriveKey('password', newSalt())
    expect(k1.equals(k2)).toBe(true)
    expect(k1.equals(k3)).toBe(false)
  })

  test('unicode content survives the roundtrip', () => {
    const salt = newSalt()
    const key = deriveKey('password', salt)
    const text = 'código—ção 🔐 \n multi\nline'
    expect(decrypt(encrypt(text, key, kdfFor(salt)), key)).toBe(text)
  })
})
