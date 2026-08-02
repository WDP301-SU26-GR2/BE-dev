import { ReaderVoteListItemSchema, ReaderVoteResSchema } from './survey-vote.schemas'
import {
  BoardRankingItemSchema,
  InternalRankingAggregateResSchema,
  RankingAggregateResSchema,
  SurveyPeriodListQuerySchema,
  SurveyPeriodListResSchema
} from './survey-schemas'

describe('internal survey period listing schemas', () => {
  it('coerces pagination defaults and validates enum filters', () => {
    expect(
      SurveyPeriodListQuerySchema.parse({
        magazine: ' Jump ',
        publicationType: 'WEEKLY',
        status: 'OPEN',
        limit: '10',
        offset: '20'
      })
    ).toEqual({ magazine: 'Jump', publicationType: 'WEEKLY', status: 'OPEN', limit: 10, offset: 20 })
    expect(SurveyPeriodListQuerySchema.parse({})).toEqual({ limit: 20, offset: 0 })
    expect(SurveyPeriodListQuerySchema.safeParse({ status: 'INVALID' }).success).toBe(false)
  })

  it('uses a stable paginated response object instead of a bare array', () => {
    expect(SurveyPeriodListResSchema.safeParse({ items: [], total: 0, limit: 20, offset: 0 }).success).toBe(true)
    expect(SurveyPeriodListResSchema.safeParse([]).success).toBe(false)
  })
})

describe('public/internal aggregate schema boundary', () => {
  const aggregate = {
    magazine: 'Jump',
    publicationType: 'WEEKLY',
    level: 'YEAR',
    year: 2026,
    reflectedIssueCount: 1,
    items: [
      {
        rankPosition: 1,
        seriesId: 'series-1',
        seriesTitle: 'A',
        reflectedIssueCount: 1,
        totalWeightedVoteCount: 10,
        participatedIssueCount: 1,
        participationCoverage: 1,
        averageNormalizedScore: 1,
        isProvisional: false,
        isAtRisk: true,
        riskLevel: 'SEVERE',
        isReliable: true
      }
    ]
  }

  it('accepts risk fields only in the authenticated internal response schema', () => {
    expect(InternalRankingAggregateResSchema.safeParse(aggregate).success).toBe(true)
    expect(RankingAggregateResSchema.safeParse(aggregate).success).toBe(false)
  })
})

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

// Spec 25 — chống drift giữa list và detail (kèm lợi ích bảo mật: thu hẹp bề mặt lộ hash guest).
describe('ReaderVoteListItemSchema (Spec 25)', () => {
  const listKeys = Object.keys(ReaderVoteListItemSchema.shape)
  const detailKeys = Object.keys(ReaderVoteResSchema.shape)

  // 🔒 §81 đã dọn PII guest (chỉ lưu hash, không lưu raw). List trả hash cho MỌI phiếu là bề mặt lộ
  // thừa — chống-gian-lận chỉ cần isFlagged/voteWeight. Tính chất "DB không lưu email gốc" được canh
  // ở flowtest 04.42c (assert thẳng trên Prisma), KHÔNG được xoá case đó cho xanh.
  it('bỏ identityHash/ipHash/captchaScore khỏi list', () => {
    for (const key of ['identityHash', 'ipHash', 'captchaScore']) expect(listKeys).not.toContain(key)
    expect(listKeys).toHaveLength(8)
  })

  it('giữ tín hiệu chống gian lận mà card cần', () => {
    for (const key of ['isFlagged', 'voteWeight']) expect(listKeys).toContain(key)
  })

  it('là tập con thực sự của ReaderVoteResSchema', () => {
    for (const key of listKeys) expect(detailKeys).toContain(key)
  })
})
