import { describe, expect, test } from 'bun:test'
import { WrongPasswordError } from '../src/domain/errors.ts'
import { nodeCrypto } from '../src/infrastructure/crypto/node-crypto.ts'

describe('crypto', () => {
  test('encrypt/decrypt roundtrip', () => {
    const kdf = nodeCrypto.newKdfParams()
    const key = nodeCrypto.deriveKey('secret-password', kdf)
    const envelope = nodeCrypto.encrypt('{"hello":"world"}', key, kdf)
    expect(nodeCrypto.decrypt(envelope, key)).toBe('{"hello":"world"}')
  })

  test('wrong password fails GCM authentication', () => {
    const kdf = nodeCrypto.newKdfParams()
    const key = nodeCrypto.deriveKey('right-password', kdf)
    const envelope = nodeCrypto.encrypt('data', key, kdf)
    const wrongKey = nodeCrypto.deriveKey('wrong-password', kdf)
    expect(() => nodeCrypto.decrypt(envelope, wrongKey)).toThrow(WrongPasswordError)
  })

  test('tampered payload fails authentication', () => {
    const kdf = nodeCrypto.newKdfParams()
    const key = nodeCrypto.deriveKey('password', kdf)
    const envelope = nodeCrypto.encrypt('original data', key, kdf)
    const tampered = Buffer.from(envelope.data, 'base64')
    tampered[0] = tampered[0]! ^ 0xff
    envelope.data = tampered.toString('base64')
    expect(() => nodeCrypto.decrypt(envelope, key)).toThrow(WrongPasswordError)
  })

  test('fresh IV on every encrypt', () => {
    const kdf = nodeCrypto.newKdfParams()
    const key = nodeCrypto.deriveKey('password', kdf)
    const a = nodeCrypto.encrypt('x', key, kdf)
    const b = nodeCrypto.encrypt('x', key, kdf)
    expect(a.cipher.iv).not.toBe(b.cipher.iv)
    expect(a.data).not.toBe(b.data)
  })

  test('same password + same kdf = same key; different salts differ', () => {
    const kdf = nodeCrypto.newKdfParams()
    const k1 = nodeCrypto.deriveKey('password', kdf)
    const k2 = nodeCrypto.deriveKey('password', kdf)
    const k3 = nodeCrypto.deriveKey('password', nodeCrypto.newKdfParams())
    expect(k1.equals(k2)).toBe(true)
    expect(k1.equals(k3)).toBe(false)
  })

  test('unicode content survives the roundtrip', () => {
    const kdf = nodeCrypto.newKdfParams()
    const key = nodeCrypto.deriveKey('password', kdf)
    const text = 'código—ção 🔐 \n multi\nline'
    expect(nodeCrypto.decrypt(nodeCrypto.encrypt(text, key, kdf), key)).toBe(text)
  })
})
