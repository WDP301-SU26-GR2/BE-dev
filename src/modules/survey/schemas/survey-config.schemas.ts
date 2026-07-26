import { extendApi } from '@anatine/zod-openapi'
import z from 'zod'

const VotingConfigFields = {
  authMode: z.enum(['OTP', 'CAPTCHA', 'HYBRID']),
  maxSeriesPerVote: z.number().int().min(1),
  otpExpirySeconds: z.number().int().min(60),
  otpMaxAttempts: z.number().int().min(1),
  ipRateLimit: z.number().int().min(1),
  phoneRateLimit: z.number().int().min(1),
  otpCooldownSeconds: z.number().int().min(0),
  ipVotesPerPeriod: z.number().int().min(1),
  captchaThreshold: z.number().min(0).max(1)
} as const

export const VotingConfigBodySchema = extendApi(
  z
    .object({
      authMode: VotingConfigFields.authMode.optional(),
      maxSeriesPerVote: VotingConfigFields.maxSeriesPerVote.optional(),
      otpExpirySeconds: VotingConfigFields.otpExpirySeconds.optional(),
      otpMaxAttempts: VotingConfigFields.otpMaxAttempts.optional(),
      ipRateLimit: VotingConfigFields.ipRateLimit.optional(),
      phoneRateLimit: VotingConfigFields.phoneRateLimit.optional(),
      otpCooldownSeconds: VotingConfigFields.otpCooldownSeconds.optional(),
      ipVotesPerPeriod: VotingConfigFields.ipVotesPerPeriod.optional(),
      captchaThreshold: VotingConfigFields.captchaThreshold.optional()
    })
    .strict(),
  { title: 'VotingConfigBody', description: 'Cập nhật cấu hình bình chọn' }
)

export const VotingConfigResSchema = extendApi(
  z
    .object({
      id: z.string(),
      ...VotingConfigFields,
      updatedAt: z.string().datetime()
    })
    .strict(),
  { title: 'VotingConfigRes', description: 'Cấu hình bình chọn hiện tại' }
)
