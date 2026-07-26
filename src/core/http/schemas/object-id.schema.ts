import { z } from 'zod'

export const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/

export function isObjectId(value: string): boolean {
  return OBJECT_ID_PATTERN.test(value)
}

export function zObjectId(message = 'Invalid ObjectId') {
  return z.string().regex(OBJECT_ID_PATTERN, message).describe('MongoDB ObjectId (24 hexadecimal characters)')
}
