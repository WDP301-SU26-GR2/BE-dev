import { extendApi } from '@anatine/zod-openapi'
import { Demographic, Genre, PublicationType, RiskLevel, SurveyStatus } from '@prisma/client'
import z from 'zod'
import { zEnum } from 'src/core/http/docs/enum-docs'
import { zDateField } from 'src/core/http/docs/date-docs'

const SurveyCreateStatusSchema = zEnum(SurveyStatus, 'SurveyStatus').refine(
  (status): status is typeof SurveyStatus.DRAFT | typeof SurveyStatus.OPEN | typeof SurveyStatus.CLOSED =>
    status !== SurveyStatus.REFLECTED,
  { message: 'status chỉ được là DRAFT, OPEN hoặc CLOSED khi tạo kỳ bình chọn.' }
)

const SurveyUpdateStatusSchema = zEnum(SurveyStatus, 'SurveyStatus').refine(
  (status): status is typeof SurveyStatus.OPEN | typeof SurveyStatus.CLOSED | typeof SurveyStatus.REFLECTED =>
    status !== SurveyStatus.DRAFT,
  { message: 'status chỉ được là OPEN, CLOSED hoặc REFLECTED khi cập nhật kỳ bình chọn.' }
)

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

export const CreateSurveyPeriodBodySchema = extendApi(
  z
    .object({
      issueNumber: z.number().int().positive().optional(),
      reflectedIssueNumber: z.number().int().positive().optional(),
      startDate: z.string().datetime({ message: 'startDate phải là chuỗi ISO 8601.' }),
      endDate: z.string().datetime({ message: 'endDate phải là chuỗi ISO 8601.' }),
      status: SurveyCreateStatusSchema.optional()
    })
    .strict(),
  { title: 'CreateSurveyPeriodBody', description: 'Editor tạo kỳ bình chọn mới' }
)

export const UpdateSurveyPeriodStatusBodySchema = extendApi(
  z
    .object({
      status: SurveyUpdateStatusSchema
    })
    .strict(),
  { title: 'UpdateSurveyPeriodStatusBody', description: 'Editor cập nhật trạng thái kỳ bình chọn' }
)

export const ImportSurveyDataBodySchema = extendApi(
  z
    .object({
      surveyPeriodId: z.string().min(1, { message: 'surveyPeriodId là bắt buộc.' }),
      issueNumber: z.number().int().positive().optional(),
      reflectedIssueNumber: z.number().int().positive().optional(),
      surveyDate: z.string().datetime({ message: 'surveyDate phải là chuỗi ISO 8601.' }).optional(),
      entries: z
        .array(
          z
            .object({
              seriesId: z.string().min(1, { message: 'seriesId là bắt buộc.' }),
              voteCount: z.number().int().min(0, { message: 'voteCount phải >= 0.' })
            })
            .strict()
        )
        .min(1, { message: 'Phải có ít nhất một entry.' })
    })
    .strict(),
  { title: 'ImportSurveyDataBody', description: 'Editor nhập vote offline từ postcard' }
)

export const VotingConfigBodySchema = extendApi(
  z
    .object({
      authMode: z.enum(['OTP', 'CAPTCHA', 'HYBRID']).optional(),
      maxSeriesPerVote: z.number().int().min(1).optional(),
      otpExpirySeconds: z.number().int().min(60).optional(),
      otpMaxAttempts: z.number().int().min(1).optional(),
      ipRateLimit: z.number().int().min(1).optional(),
      phoneRateLimit: z.number().int().min(1).optional(),
      otpCooldownSeconds: z.number().int().min(0).optional(),
      ipVotesPerPeriod: z.number().int().min(1).optional(),
      captchaThreshold: z.number().min(0).max(1).optional()
    })
    .strict(),
  { title: 'VotingConfigBody', description: 'Cập nhật cấu hình bình chọn' }
)

export const SurveyPeriodResSchema = extendApi(
  z
    .object({
      id: z.string(),
      issueNumber: z.number().int().optional(),
      reflectedIssueNumber: z.number().int().optional(),
      startDate: z.string().datetime(),
      endDate: z.string().datetime(),
      status: zEnum(SurveyStatus, 'SurveyStatus')
    })
    .strict(),
  { title: 'SurveyPeriodRes', description: 'Chi tiết kỳ bình chọn' }
)

export const VotingConfigResSchema = extendApi(
  z
    .object({
      id: z.string(),
      authMode: z.enum(['OTP', 'CAPTCHA', 'HYBRID']),
      maxSeriesPerVote: z.number().int(),
      otpExpirySeconds: z.number().int(),
      otpMaxAttempts: z.number().int(),
      ipRateLimit: z.number().int(),
      phoneRateLimit: z.number().int(),
      otpCooldownSeconds: z.number().int(),
      ipVotesPerPeriod: z.number().int(),
      captchaThreshold: z.number(),
      updatedAt: z.string().datetime()
    })
    .strict(),
  { title: 'VotingConfigRes', description: 'Cấu hình bình chọn hiện tại' }
)

export const RankingRecordResSchema = extendApi(
  z
    .object({
      seriesId: z.string(),
      rankPosition: z.number().int().optional(),
      voteCount: z.number(),
      previousRank: z.number().int().nullable(),
      rankChange: z.number().int().nullable(),
      isAtRisk: z.boolean(),
      riskLevel: zEnum(RiskLevel, 'RiskLevel'),
      consecutiveAtRiskCount: z.number().int(),
      isReliable: z.boolean()
    })
    .strict(),
  { title: 'RankingRecordRes', description: 'Kết quả ranking của một series' }
)

export const RankingRecordListResSchema = extendApi(
  z
    .object({
      items: z.array(RankingRecordResSchema)
    })
    .strict(),
  { title: 'RankingRecordListRes', description: 'Danh sách ranking' }
)

// PB-04 trend/board ranking item — bổ sung recordedAt ISO string.
export const BoardRankingItemSchema = extendApi(
  z
    .object({
      seriesId: z.string(),
      rankPosition: z.number().int().optional(),
      voteCount: z.number(),
      previousRank: z.number().int().nullable(),
      rankChange: z.number().int().nullable(),
      isAtRisk: z.boolean(),
      riskLevel: zEnum(RiskLevel, 'RiskLevel'),
      isReliable: z.boolean(),
      recordedAt: z.string()
    })
    .strict(),
  { title: 'BoardRankingItem', description: 'Item ranking trong bảng xếp hạng toàn tạp chí / trend 1 series' }
)

export const BoardRankingListResSchema = extendApi(
  z
    .object({
      items: z.array(BoardRankingItemSchema)
    })
    .strict(),
  { title: 'BoardRankingListRes', description: 'Danh sách ranking (bảng tạp chí hoặc trend 1 series)' }
)

// PB-04 query DTO cho /rankings trend
export const GetSeriesTrendQuerySchema = extendApi(
  z
    .object({
      seriesId: z.string().min(1, { message: 'seriesId là bắt buộc.' }),
      periods: z.coerce.number().int().min(1).max(60).default(12)
    })
    .strict(),
  { title: 'GetSeriesTrendQuery', description: 'Query lấy trend ranking của 1 series (mặc định 12 kỳ gần nhất)' }
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

export const ReaderVoteListResSchema = extendApi(
  z
    .object({
      data: z.array(ReaderVoteResSchema)
    })
    .strict(),
  { title: 'ReaderVoteListRes', description: 'Danh sách phiếu vote reader' }
)

export const SurveyDataEntryResSchema = extendApi(
  z
    .object({
      seriesId: z.string().nullable(),
      voteCount: z.number().int()
    })
    .strict(),
  { title: 'SurveyDataEntryRes', description: 'Một entry vote offline' }
)

export const SurveyDataResSchema = extendApi(
  z
    .object({
      id: z.string(),
      surveyPeriodId: z.string(),
      importedBy: z.string().nullable(),
      surveyDate: zDateField().nullable(),
      importedAt: zDateField(),
      entries: z.array(SurveyDataEntryResSchema)
    })
    .strict(),
  { title: 'SurveyDataRes', description: 'Một lần nhập vote offline' }
)

export const SurveyDataListResSchema = extendApi(
  z
    .object({
      data: z.array(SurveyDataResSchema)
    })
    .strict(),
  { title: 'SurveyDataListRes', description: 'Danh sách dữ liệu vote offline' }
)

// Fix-1 G-2: Public vote context (Guest) — kỳ OPEN + danh sách series SERIALIZED (field public-safe).
export const VoteContextResSchema = extendApi(
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

// Fix-1 G-2: Public vote results (chỉ sau khi kỳ REFLECTED). ẨN tín hiệu biên tập nội bộ.
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
  .object({
    surveyPeriodId: z.string().min(1, { message: 'surveyPeriodId là bắt buộc.' }),
    // Spec 15.2: bảng con theo nhịp xuất bản (WEEKLY/MONTHLY/IRREGULAR); omit = bảng tổng.
    publicationType: zEnum(PublicationType, 'PublicationType').optional()
  })
  .strict()

// Spec 15.2 — query riêng cho /vote/results/latest (1 field optional → thỏa ràng buộc non-empty strict query).
export const LatestVoteResultsQuerySchema = z
  .object({
    publicationType: zEnum(PublicationType, 'PublicationType').optional()
  })
  .strict()

// Option B: tab Tuần/Tháng cho trang vote Guest. Optional → không truyền = mọi type có nhịp.
export const VoteContextQuerySchema = z
  .object({
    publicationType: zEnum(PublicationType, 'PublicationType').optional()
  })
  .strict()

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
  {
    title: 'LatestVoteResultsRes',
    description: 'Bảng xếp hạng kỳ REFLECTED mới nhất — Spec 15 §3.1'
  }
)

export const VotePeriodsQuerySchema = extendApi(
  z
    .object({
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
  {
    title: 'VotePeriodsRes',
    description: 'Kỳ REFLECTED (lịch sử) cho dropdown — Spec 15 §3.2'
  }
)
