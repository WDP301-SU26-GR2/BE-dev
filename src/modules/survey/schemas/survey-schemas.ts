import { extendApi } from '@anatine/zod-openapi'
import z from 'zod'

export const VoteOtpRequestBodySchema = extendApi(
  z
    .object({
      phoneNumber: z.string().min(10, { message: 'SĐT phải chứa tối thiểu 10 ký tự.' }),
      captchaToken: z.string().min(1, { message: 'Captcha token là bắt buộc.' })
    })
    .strict(),
  { title: 'VoteOtpRequestBody', description: 'Payload yêu cầu OTP bình chọn cho Guest Voting.' }
)

export const ReaderVoteBodySchema = extendApi(
  z
    .object({
      surveyPeriodId: z.string().min(1, { message: 'surveyPeriodId là bắt buộc.' }),
      phoneNumber: z.string().min(10, { message: 'SĐT là bắt buộc.' }),
      otpCode: z.string().min(4, { message: 'OTP là bắt buộc.' }),
      seriesIds: z.array(z.string().min(1)).min(1).max(3, { message: 'Tối đa 3 series được chọn.' }),
      captchaScore: z.number().min(0).max(1).optional()
    })
    .strict(),
  { title: 'ReaderVoteBody', description: 'Payload xác thực OTP và nộp vote cho kỳ bình chọn.' }
)

export const CreateSurveyPeriodBodySchema = extendApi(
  z
    .object({
      issueNumber: z.number().int().positive().optional(),
      reflectedIssueNumber: z.number().int().positive().optional(),
      startDate: z.string().datetime({ message: 'startDate phải là chuỗi ISO 8601.' }),
      endDate: z.string().datetime({ message: 'endDate phải là chuỗi ISO 8601.' }),
      status: z.enum(['DRAFT', 'OPEN', 'CLOSED']).optional()
    })
    .strict(),
  { title: 'CreateSurveyPeriodBody', description: 'Tạo kỳ bình chọn mới.' }
)

export const UpdateSurveyPeriodStatusBodySchema = extendApi(
  z
    .object({
      status: z.enum(['OPEN', 'CLOSED', 'REFLECTED'])
    })
    .strict(),
  { title: 'UpdateSurveyPeriodStatusBody', description: 'Cập nhật trạng thái kỳ bình chọn.' }
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
  { title: 'ImportSurveyDataBody', description: 'Payload nhập dữ liệu bình chọn offline từ postcard.' }
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
      captchaThreshold: z.number().min(0).max(1).optional()
    })
    .strict(),
  { title: 'VotingConfigBody', description: 'Cập nhật cấu hình bình chọn.' }
)

export const SurveyPeriodResSchema = extendApi(
  z
    .object({
      id: z.string(),
      issueNumber: z.number().int().optional(),
      reflectedIssueNumber: z.number().int().optional(),
      startDate: z.string().datetime(),
      endDate: z.string().datetime(),
      status: z.enum(['DRAFT', 'OPEN', 'CLOSED', 'REFLECTED'])
    })
    .strict(),
  { title: 'SurveyPeriodRes', description: 'Chi tiết kỳ bình chọn.' }
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
      captchaThreshold: z.number(),
      updatedAt: z.string().datetime()
    })
    .strict(),
  { title: 'VotingConfigRes', description: 'Cấu hình hiện tại của hệ thống bình chọn.' }
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
      isReliable: z.boolean()
    })
    .strict(),
  { title: 'RankingRecordRes', description: 'Kết quả xếp hạng tổng hợp cho một series.' }
)

export const RankingRecordListResSchema = extendApi(
  z
    .object({
      items: z.array(RankingRecordResSchema)
    })
    .strict(),
  { title: 'RankingRecordListRes', description: 'Danh sách kết quả xếp hạng.' }
)
