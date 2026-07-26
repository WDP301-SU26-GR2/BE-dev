import { extendApi } from '@anatine/zod-openapi'
import { PublicationType, RiskLevel } from '@prisma/client'
import z from 'zod'
import { zEnum } from 'src/core/http/docs/enum-docs'

const RankingScopeFields = {
  surveyPeriodId: z.string().describe('Reflected scoped survey period that produced this ranking row'),
  magazine: z.string().nullable().describe('Magazine scope; null only for legacy ranking rows'),
  publicationType: zEnum(PublicationType, 'PublicationType')
    .nullable()
    .describe('Publication type scope; null only for legacy ranking rows'),
  issueNumber: z.number().int().nullable().describe('Issue number of the source survey period')
}

const RankingFields = {
  seriesId: z.string(),
  ...RankingScopeFields,
  rankPosition: z.number().int().optional(),
  voteCount: z.number(),
  normalizedScore: z.number(),
  previousRank: z.number().int().nullable(),
  rankChange: z.number().int().nullable(),
  isAtRisk: z.boolean(),
  riskLevel: zEnum(RiskLevel, 'RiskLevel'),
  consecutiveAtRiskCount: z.number().int(),
  isReliable: z.boolean()
}

export const RankingRecordResSchema = extendApi(z.object(RankingFields).strict(), {
  title: 'RankingRecordRes',
  description: 'Kết quả ranking của một series'
})

export const RankingRecordListResSchema = extendApi(z.object({ items: z.array(RankingRecordResSchema) }).strict(), {
  title: 'RankingRecordListRes',
  description: 'Danh sách ranking'
})

export const BoardRankingItemSchema = extendApi(
  z
    .object({
      ...RankingFields,
      recordedAt: z.string()
    })
    .omit({ consecutiveAtRiskCount: true })
    .strict(),
  { title: 'BoardRankingItem', description: 'Item ranking trong bảng xếp hạng toàn tạp chí / trend 1 series' }
)

export const BoardRankingListResSchema = extendApi(z.object({ items: z.array(BoardRankingItemSchema) }).strict(), {
  title: 'BoardRankingListRes',
  description: 'Danh sách ranking (bảng tạp chí hoặc trend 1 series)'
})

export const GetSeriesTrendQuerySchema = extendApi(
  z
    .object({
      seriesId: z.string().min(1, { message: 'seriesId là bắt buộc.' }),
      periods: z.coerce.number().int().min(1).max(60).default(12)
    })
    .strict(),
  { title: 'GetSeriesTrendQuery', description: 'Query lấy trend ranking của 1 series (mặc định 12 kỳ gần nhất)' }
)

const RankingAggregateBaseQuerySchema = {
  magazine: z.string().trim().min(1, { message: 'magazine is required.' }),
  publicationType: zEnum(PublicationType, 'PublicationType'),
  year: z.coerce.number().int().min(1970).max(9999)
}

export const RankingAggregateQuerySchema = extendApi(
  z
    .object({
      ...RankingAggregateBaseQuerySchema,
      level: z.enum(['MONTH', 'YEAR']),
      month: z.coerce.number().int().min(1).max(12).optional()
    })
    .strict()
    .superRefine((query, context) => {
      if (query.level === 'MONTH' && query.month == null) {
        context.addIssue({ code: 'custom', message: 'month is required when level is MONTH.', path: ['month'] })
      }
    }),
  {
    title: 'RankingAggregateQuery',
    description:
      'Public aggregate range. MONTH requires month; YEAR aggregates every reflected issue in the UTC calendar year.'
  }
)

export const RankingAggregateResSchema = extendApi(
  z
    .object({
      magazine: z.string(),
      publicationType: zEnum(PublicationType, 'PublicationType'),
      level: z.enum(['MONTH', 'YEAR']),
      year: z.number().int(),
      month: z.number().int().min(1).max(12).optional(),
      reflectedIssueCount: z.number().int().nonnegative(),
      items: z.array(
        z
          .object({
            rankPosition: z.number().int().positive(),
            seriesId: z.string(),
            seriesTitle: z.string().nullable(),
            reflectedIssueCount: z.number().int().nonnegative(),
            totalWeightedVoteCount: z.number(),
            participatedIssueCount: z.number().int().positive(),
            participationCoverage: z.number().min(0).max(1),
            averageNormalizedScore: z.number(),
            isProvisional: z.boolean()
          })
          .strict()
      )
    })
    .strict(),
  {
    title: 'RankingAggregateRes',
    description:
      'Public participation-adjusted ranking. Rank uses average normalized score; total weighted votes are informational and provisional flags low coverage.'
  }
)
