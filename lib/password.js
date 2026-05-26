import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'

const KEYLEN = 64

export function hashAdminPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(String(password), salt, KEYLEN).toString('hex')
  return `scrypt$${salt}$${hash}`
}

export function verifyAdminPassword(password, stored) {
  const raw = String(stored || '')
  if (!raw) return false

  if (!raw.startsWith('scrypt$')) {
    return raw === String(password || '')
  }

  const [, salt, expectedHex] = raw.split('$')
  if (!salt || !expectedHex) return false

  const actual = scryptSync(String(password || ''), salt, KEYLEN)
  const expected = Buffer.from(expectedHex, 'hex')
  if (actual.length !== expected.length) return false
  return timingSafeEqual(actual, expected)
}
