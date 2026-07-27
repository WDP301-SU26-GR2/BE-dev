import {
  CounterDeadlineBodySchema,
  CreateDeadlineRequestBodySchema,
  DeadlineRequestListItemSchema,
  DeadlineRequestResSchema
} from './deadline-schemas'

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

// Spec 25 — chống drift giữa list và detail.
describe('DeadlineRequestListItemSchema (Spec 25)', () => {
  const listKeys = Object.keys(DeadlineRequestListItemSchema.shape)
  const detailKeys = Object.keys(DeadlineRequestResSchema.shape)

  it('bỏ 4 field chỉ dùng ở detail', () => {
    for (const key of ['reason', 'boardReviewedBy', 'scheduleId', 'resolvedAt']) {
      expect(listKeys).not.toContain(key)
    }
    expect(listKeys).toHaveLength(12)
  })

  // 🔴 A-DL-02 turn-taking: FE phải biết đến lượt ai. 2 field này là PHE (MANGAKA|EDITOR),
  // KHÔNG phải userId (Spec 20 AC3) — bỏ đi là hỏng luồng thương lượng lượt-đi-lượt-lại.
  it('giữ requestedBy/lastProposedBy cho turn-taking', () => {
    expect(listKeys).toContain('requestedBy')
    expect(listKeys).toContain('lastProposedBy')
  })

  it('là tập con thực sự của DeadlineRequestResSchema', () => {
    for (const key of listKeys) expect(detailKeys).toContain(key)
  })
})
