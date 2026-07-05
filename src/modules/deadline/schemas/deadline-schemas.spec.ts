import { CounterDeadlineBodySchema, CreateDeadlineRequestBodySchema } from './deadline-schemas'

describe('deadline-schemas', () => {
  const futureDeadline = new Date(Date.now() + 60_000).toISOString()
  const pastDeadline = new Date(Date.now() - 60_000).toISOString()

  describe('CreateDeadlineRequestBodySchema', () => {
    it('accepts a future requestedDeadline', () => {
      expect(
        CreateDeadlineRequestBodySchema.safeParse({
          chapterId: 'chapter-1',
          requestedDeadline: futureDeadline,
          reason: 'Need more time'
        }).success
      ).toBe(true)
    })

    it('rejects a past requestedDeadline', () => {
      expect(
        CreateDeadlineRequestBodySchema.safeParse({
          chapterId: 'chapter-1',
          requestedDeadline: pastDeadline,
          reason: 'Need more time'
        }).success
      ).toBe(false)
    })
  })

  describe('CounterDeadlineBodySchema', () => {
    it('rejects a past requestedDeadline', () => {
      expect(
        CounterDeadlineBodySchema.safeParse({
          requestedDeadline: pastDeadline,
          reason: 'Counter proposal'
        }).success
      ).toBe(false)
    })
  })
})
