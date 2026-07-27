import { ReaderVoteListItemSchema, ReaderVoteResSchema } from './survey-vote.schemas'
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
