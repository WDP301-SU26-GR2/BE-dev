import { z } from 'zod'
import { extendApi } from '@anatine/zod-openapi'
import { $Enums } from '@prisma/client'
import { zEnum } from 'src/core/http/docs/enum-docs'

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
    purpose: zEnum($Enums.OtpPurpose, 'OtpPurpose'),
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
