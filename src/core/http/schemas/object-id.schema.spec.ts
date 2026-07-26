import { isObjectId, zObjectId } from './object-id.schema'

describe('ObjectId schema', () => {
  it('accepts exactly 24 hexadecimal characters', () => {
    expect(isObjectId('0123456789abcdefABCDEF01')).toBe(true)
    expect(zObjectId().parse('0123456789abcdefABCDEF01')).toBe('0123456789abcdefABCDEF01')
  })

  it.each(['', 'abc', 'g'.repeat(24), 'a'.repeat(25)])('rejects malformed value %p', (value) => {
    expect(isObjectId(value)).toBe(false)
    expect(zObjectId().safeParse(value).success).toBe(false)
  })

  it('preserves an entity-specific validation message', () => {
    const result = zObjectId('pageId is invalid').safeParse('bad')
    expect(result.error?.issues[0]?.message).toBe('pageId is invalid')
  })
})
