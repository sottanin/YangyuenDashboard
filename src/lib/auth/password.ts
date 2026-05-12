import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'crypto'

const ALGORITHM = 'pbkdf2_sha256'
const ITERATIONS = 310000
const KEY_LENGTH = 32
const DIGEST = 'sha256'

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('base64url')
  const hash = pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString('base64url')
  return `${ALGORITHM}$${ITERATIONS}$${salt}$${hash}`
}

export function verifyPassword(password: string, storedHash: string) {
  const [algorithm, iterationsText, salt, hash] = storedHash.split('$')
  const iterations = Number(iterationsText)

  if (algorithm !== ALGORITHM || !Number.isInteger(iterations) || !salt || !hash) {
    return false
  }

  const candidate = pbkdf2Sync(password, salt, iterations, KEY_LENGTH, DIGEST)
  const saved = Buffer.from(hash, 'base64url')

  if (candidate.length !== saved.length) return false
  return timingSafeEqual(candidate, saved)
}
