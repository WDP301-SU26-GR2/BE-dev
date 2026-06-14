import { z } from 'zod'
import { OtpPurpose } from '../auth.constant'
import { extendApi } from '@anatine/zod-openapi'

//Role
export const RoleSchema = extendApi(
  z.object({
    id: z.string(),
    code: z.string(),
    description: z.string().nullable(),
    isSystem: z.boolean(),
    createdAt: z.date(),
    updatedAt: z.date()
  }),
  { title: 'Role', description: 'Role record' }
)

//Otp CODE
export const OtpCodeSchema = extendApi(
  z.object({
    id: z.string(),
    email: z.string().email(),
    otpCodeHash: z.string(),
    ip: z.string().nullable(),
    purpose: z.enum([OtpPurpose.REGISTER, OtpPurpose.FORGOT_PASSWORD, OtpPurpose.SIGNING_CONTRACT]),
    expiresAt: z.date(),
    createdAt: z.date(),
    attempts: z.number(),
    isUsed: z.boolean()
  }),
  { title: 'OtpCode', description: 'OTP code record' }
)

//Refresh Token
export const RefreshTokenSchema = extendApi(
  z.object({
    token: z.string(),
    userId: z.string(),
    expiresAt: z.date(),
    createdAt: z.date()
  }),
  { title: 'RefreshToken', description: 'Refresh token record' }
)

export type OtpCodeType = z.infer<typeof OtpCodeSchema>
export type RoleType = z.infer<typeof RoleSchema>
