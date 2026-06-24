import { randomBytes, randomInt } from 'crypto'

export const generateTemporaryPassword = (): string => {
  const base = randomBytes(8)
    .toString('base64url')
    .replace(/[^a-zA-Z0-9]/g, '')
  const upper = String.fromCharCode(65 + randomInt(26))
  const lower = String.fromCharCode(97 + randomInt(26))
  const digit = String.fromCharCode(48 + randomInt(10))

  return `${upper}${lower}${digit}${base}`.slice(0, 16)
}
