import { extendApi } from '@anatine/zod-openapi'
import { Demographic, Genre, PublicationType } from '@prisma/client'
import z from 'zod'
import { zDateField } from 'src/core/http/docs/date-docs'
import { zEnum } from 'src/core/http/docs/enum-docs'
import { zObjectId } from 'src/core/http/schemas/object-id.schema'

export const VoteOtpRequestBodySchema = extendApi(
  z
    .object({
      identity: z
        .string()
        .email({ message: 'identity phải là email hợp lệ.' })
        .describe('Email nhận OTP - hệ chạy EMAIL mode (Requiment 1.15d); SMS là mở rộng tương lai'),
      captchaToken: z.string().min(1, { message: 'Captcha token là bắt buộc.' })
    })
    .strict(),
  { title: 'VoteOtpRequestBody', description: 'Reader yêu cầu OTP cho Guest Voting' }
)

export const ReaderVoteBodySchema = extendApi(
  z
    .object({
      surveyPeriodId: z.string().min(1, { message: 'surveyPeriodId là bắt buộc.' }),
      identity: z.string().email({ message: 'identity phải là email hợp lệ.' }).describe('Email đã nhận OTP'),
      otpCode: z.string().min(4, { message: 'OTP là bắt buộc.' }),
      seriesIds: z.array(z.string().min(1)).min(1).max(3, { message: 'Tối đa 3 series được chọn.' }),
      captchaToken: z.string().min(1, { message: 'Captcha token là bắt buộc.' })
    })
    .strict(),
  { title: 'ReaderVoteBody', description: 'Reader xác thực OTP và gửi vote' }
)

export const ReaderVoteResSchema = extendApi(
  z
    .object({
      id: z.string(),
      surveyPeriodId: z.string(),
      seriesIds: z.array(z.string()),
      identityHash: z.string().nullable(),
      publicationType: zEnum(PublicationType, 'PublicationType')
        .nullable()
        .describe('Option B: nhịp series được vote (null = phiếu cũ trước Option B)'),
      authMethod: z.enum(['EMAIL_OTP', 'PHONE_OTP', 'CAPTCHA_ONLY']).nullable(),
      ipHash: z.string().nullable(),
      captchaScore: z.number().nullable(),
      voteWeight: z.number(),
      isFlagged: z.boolean(),
      votedAt: zDateField()
    })
    .strict(),
  { title: 'ReaderVoteRes', description: 'Một phiếu vote reader' }
)

export const ReaderVoteListItemSchema = extendApi(
  ReaderVoteResSchema.omit({
    identityHash: true,
    ipHash: true,
    captchaScore: true
  }),
  {
    title: 'ReaderVoteListItemRes',
    description: 'Reader vote list item without internal hash/captcha signals'
  }
)

export const ReaderVoteListResSchema = extendApi(z.object({ data: z.array(ReaderVoteListItemSchema) }).strict(), {
  title: 'ReaderVoteListRes',
  description: 'Danh sách phiếu vote reader'
})

export const VoteContextResSchema = extendApi(
  z
    .object({
      period: z
        .object({
          id: z.string(),
          magazine: z.string().optional(),
          publicationType: zEnum(PublicationType, 'PublicationType').optional(),
          issueNumber: z.number().int().nullable(),
          reflectedIssueNumber: z.number().int().nullable(),
          startDate: z.string().nullable().describe('ISO 8601 UTC'),
          endDate: z.string().nullable().describe('ISO 8601 UTC')
        })
        .nullable()
        .describe('null = hiện không có kỳ bình chọn OPEN'),
      series: z.array(
        z
          .object({
            id: z.string(),
            title: z.string(),
            coverImage: z
              .string()
              .nullable()
              .describe('Object key R2 — xem catalog public /public/series để lấy signed URL'),
            genres: z.array(zEnum(Genre, 'Genre')),
            demographic: zEnum(Demographic, 'Demographic').nullable(),
            publicationType: zEnum(PublicationType, 'PublicationType').describe(
              'Nhịp xuất bản — Option B: FE tách tab Tuần/Tháng, mỗi tab vote series cùng type'
            )
          })
          .strict()
      ),
      maxSeriesPerVote: z.number().int()
    })
    .strict(),
  {
    title: 'VoteContextRes',
    description: 'Dữ liệu public dựng trang bình chọn Guest (Req 2.5#1) — Fix-1 G-2'
  }
)

const VoteResultItemSchema = z
  .object({
    rankPosition: z
      .number()
      .int()
      .nullable()
      .describe('Vị trí trên BẢNG TỔNG của kỳ (giữ nguyên khi filter publicationType — FE tự đánh số bảng con)'),
    seriesId: z.string(),
    seriesTitle: z.string().nullable().describe('null nếu series đã bị xóa'),
    publicationType: zEnum(PublicationType, 'PublicationType')
      .nullable()
      .describe('Nhịp xuất bản của series — Spec 15.2'),
    voteCount: z.number(),
    rankChange: z.number().int().nullable()
  })
  .strict()

export const VoteResultsResSchema = extendApi(
  z
    .object({
      surveyPeriodId: z.string(),
      issueNumber: z.number().int().nullable(),
      results: z.array(VoteResultItemSchema)
    })
    .strict(),
  {
    title: 'VoteResultsRes',
    description:
      'Bảng xếp hạng public sau khi kỳ REFLECTED (Req 2.5#3) — Fix-1 G-2. KHÔNG chứa tín hiệu nội bộ (isAtRisk/riskLevel/isReliable)'
  }
)

export const VoteResultsQuerySchema = z
  .object({ surveyPeriodId: z.string().min(1, { message: 'surveyPeriodId là bắt buộc.' }) })
  .strict()

export const LatestVoteResultsQuerySchema = z
  .object({
    magazine: z.string().trim().min(1),
    publicationType: zEnum(PublicationType, 'PublicationType')
  })
  .strict()

export const VoteContextQuerySchema = z.object({ periodId: zObjectId() }).strict()

export const VoteLiveQuerySchema = extendApi(
  z.object({ periodId: zObjectId('periodId must be an ObjectId.').describe('OPEN scoped SurveyPeriod id') }).strict(),
  { title: 'VoteLiveQuery', description: 'Public live raw-tally query for exactly one OPEN issue' }
)

export const VoteTallyResSchema = extendApi(
  z
    .object({
      periodId: z.string(),
      magazine: z.string(),
      publicationType: zEnum(PublicationType, 'PublicationType'),
      issueNumber: z.number().int().nullable(),
      tally: z.array(
        z
          .object({
            seriesId: z.string(),
            title: z.string(),
            coverImage: z.string().nullable(),
            count: z.number().int().min(0).describe('Raw ReaderVote selection count, not weighted ranking score')
          })
          .strict()
      ),
      totalVotes: z.number().int().min(0).describe('Valid ballot count; it can differ from sum(tally[].count)'),
      updatedAt: z.string().datetime()
    })
    .strict(),
  { title: 'VoteTallyRes', description: 'Public live raw tally for an OPEN scoped issue; this is not a final ranking.' }
)

export const LatestVoteResultsResSchema = extendApi(
  z
    .object({
      period: z
        .object({
          id: z.string(),
          issueNumber: z.number().int().nullable(),
          reflectedIssueNumber: z.number().int().nullable(),
          startDate: z.string().nullable().describe('ISO 8601 UTC'),
          endDate: z.string().nullable().describe('ISO 8601 UTC')
        })
        .strict()
        .nullable()
        .describe('null = chưa có kỳ nào REFLECTED'),
      results: z.array(VoteResultItemSchema)
    })
    .strict(),
  { title: 'LatestVoteResultsRes', description: 'Bảng xếp hạng kỳ REFLECTED mới nhất — Spec 15 §3.1' }
)

export const VotePeriodsQuerySchema = extendApi(
  z
    .object({
      magazine: z.string().trim().min(1),
      publicationType: zEnum(PublicationType, 'PublicationType'),
      limit: z.coerce.number().int().min(1).max(24).default(12)
    })
    .strict(),
  { title: 'VotePeriodsQuery' }
)

export const VotePeriodsResSchema = extendApi(
  z
    .object({
      items: z.array(
        z
          .object({
            id: z.string(),
            issueNumber: z.number().int().nullable(),
            reflectedIssueNumber: z.number().int().nullable(),
            startDate: z.string().nullable().describe('ISO 8601 UTC'),
            endDate: z.string().nullable().describe('ISO 8601 UTC')
          })
          .strict()
      )
    })
    .strict(),
  { title: 'VotePeriodsRes', description: 'Kỳ REFLECTED (lịch sử) cho dropdown — Spec 15 §3.2' }
)
