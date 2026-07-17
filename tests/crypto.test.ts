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
  test('roundtrip encrypt/decrypt', () => {
    const salt = newSalt()
    const key = deriveKey('senha-secreta', salt)
    const envelope = encrypt('{"hello":"world"}', key, kdfFor(salt))
    expect(decrypt(envelope, key)).toBe('{"hello":"world"}')
  })

  test('senha errada falha na autenticação GCM', () => {
    const salt = newSalt()
    const key = deriveKey('senha-certa', salt)
    const envelope = encrypt('dados', key, kdfFor(salt))
    const wrongKey = deriveKey('senha-errada', salt)
    expect(() => decrypt(envelope, wrongKey)).toThrow(WrongPasswordError)
  })

  test('payload adulterado falha na autenticação', () => {
    const salt = newSalt()
    const key = deriveKey('senha', salt)
    const envelope = encrypt('dados originais', key, kdfFor(salt))
    const tampered = Buffer.from(envelope.data, 'base64')
    tampered[0] = tampered[0]! ^ 0xff
    envelope.data = tampered.toString('base64')
    expect(() => decrypt(envelope, key)).toThrow(WrongPasswordError)
  })

  test('IVs diferentes a cada encrypt', () => {
    const salt = newSalt()
    const key = deriveKey('senha', salt)
    const a = encrypt('x', key, kdfFor(salt))
    const b = encrypt('x', key, kdfFor(salt))
    expect(a.cipher.iv).not.toBe(b.cipher.iv)
    expect(a.data).not.toBe(b.data)
  })

  test('mesma senha + mesmo salt = mesma chave; salts diferentes = chaves diferentes', () => {
    const salt = newSalt()
    const k1 = deriveKey('senha', salt)
    const k2 = deriveKey('senha', salt)
    const k3 = deriveKey('senha', newSalt())
    expect(k1.equals(k2)).toBe(true)
    expect(k1.equals(k3)).toBe(false)
  })

  test('conteúdo unicode sobrevive ao roundtrip', () => {
    const salt = newSalt()
    const key = deriveKey('senha', salt)
    const text = 'código—ção 🔐 \n linhas\nmúltiplas'
    expect(decrypt(encrypt(text, key, kdfFor(salt)), key)).toBe(text)
  })
})
