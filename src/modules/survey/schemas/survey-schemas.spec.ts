import { BoardRankingItemSchema } from './survey-schemas'

describe('BoardRankingItemSchema', () => {
  it('accepts normalizedScore from a scoped finalized RankingRecord', () => {
    expect(
      BoardRankingItemSchema.safeParse({
        seriesId: '507f1f77bcf86cd799439011',
        surveyPeriodId: '507f1f77bcf86cd799439012',
        magazine: 'Weekly Jump',
        publicationType: 'WEEKLY',
        issueNumber: 35,
        rankPosition: 1,
        voteCount: 12,
        normalizedScore: 0.75,
        previousRank: null,
        rankChange: null,
        isAtRisk: false,
        riskLevel: 'NONE',
        isReliable: true,
        recordedAt: '2026-07-24T00:00:00.000Z'
      }).success
    ).toBe(true)
  })
})
