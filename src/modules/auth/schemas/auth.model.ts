import { z } from 'zod'
import { UserSchema } from 'src/shared/models/shared-user.model'
import { OtpPurpose } from 'src/shared/constant/auth.constant'
import { RoleName } from 'src/shared/constant/role.constant'
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

//REGISTER
export const RegisterBodySchema = extendApi(
  UserSchema.pick({
    email: true,
    password: true,
    name: true,
    phoneNumber: true
  })
    .extend({
      displayName: z.string().min(2).max(100),
      confirm_password: z.string().min(6).max(100),
      code: z.string().length(6),
      type: z.enum([RoleName.MANGAKA, RoleName.ASSISTANT])
    })
    .strict()
    .superRefine(({ password, confirm_password }, ctx) => {
      if (password !== confirm_password) {
        ctx.addIssue({
          code: 'custom',
          message: 'Passwords do not match',
          path: ['confirm_password']
        })
      }
    }),
  {
    title: 'RegisterBody',
    description: 'Request body for user registration'
  }
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

export const SendOtpBodySchema = extendApi(
  OtpCodeSchema.pick({
    email: true,
    purpose: true
  })
    .strict()
    .superRefine(({ email, purpose }, ctx) => {
      if (email === '') {
        ctx.addIssue({
          code: 'custom',
          message: 'Error: Email is required',
          path: ['email']
        })
      }
      if (!purpose) {
        ctx.addIssue({
          code: 'custom',
          message: 'Purpose is required',
          path: ['purpose']
        })
      }
    }),
  {
    title: 'SendOtpBody',
    description: 'Request body for sending OTP'
  }
)

//Login
export const loginBodySchema = extendApi(
  UserSchema.pick({
    email: true,
    password: true
  }).strict(),
  { title: 'LoginBody', description: 'Request body for login' }
)

export const LoginResSchema = extendApi(
  z.object({
    user: UserSchema.pick({
      id: true,
      email: true,
      name: true,
      displayName: true,
      phoneNumber: true
    }).extend({
      role: z.string()
    }),
    accessToken: z.string(),
    refreshToken: z.string()
  }),
  { title: 'LoginRes', description: 'Login response' }
)

//REFRESH TOKEN
export const RefreshTokenSchema = extendApi(
  z.object({
    token: z.string(),
    userId: z.string(),
    expiresAt: z.date(),
    createdAt: z.date()
  }),
  { title: 'RefreshToken', description: 'Refresh token record' }
)

export const RefreshTokenBodySchema = extendApi(
  z
    .object({
      refreshToken: z.string()
    })
    .strict(),
  { title: 'RefreshTokenBody', description: 'Request body for refreshing token' }
)

export const RefreshTokenResSchema = extendApi(LoginResSchema, {
  title: 'RefreshTokenRes',
  description: 'Refresh token response'
})

//Logout
export const LogoutBodySchema = extendApi(RefreshTokenBodySchema, {
  title: 'LogoutBody',
  description: 'Request body for logout'
})

//Forgot Password
export const ForgotPasswordBodySchema = extendApi(
  z
    .object({
      email: z.string().email(),
      code: z.string().length(6),
      newPassword: z.string().min(6).max(100),
      confirmNewPassword: z.string().min(6).max(100)
    })
    .strict()
    .superRefine(({ newPassword, confirmNewPassword }, ctx) => {
      if (newPassword !== confirmNewPassword) {
        ctx.addIssue({
          code: 'custom',
          message: 'New passwords and confirm passwords do not match',
          path: ['confirmNewPassword']
        })
      }
    }),
  {
    title: 'ForgotPasswordBody',
    description: 'Request body for forgot password'
  }
)

//Change Password
export const ChangePasswordBodySchema = extendApi(
  z
    .object({
      currentPassword: z.string().min(6).max(100),
      newPassword: z.string().min(6).max(100),
      confirmNewPassword: z.string().min(6).max(100)
    })
    .strict()
    .superRefine(({ newPassword, confirmNewPassword }, ctx) => {
      if (newPassword !== confirmNewPassword) {
        ctx.addIssue({
          code: 'custom',
          message: 'New passwords and confirm passwords do not match',
          path: ['confirmNewPassword']
        })
      }
    }),
  {
    title: 'ChangePasswordBody',
    description: 'Request body for changing password'
  }
)

export type SendOtpBodyType = z.infer<typeof SendOtpBodySchema>
export type RegisterBodyType = z.infer<typeof RegisterBodySchema>
export type OtpCodeType = z.infer<typeof OtpCodeSchema>
export type ForgotPasswordBodyType = z.infer<typeof ForgotPasswordBodySchema>
export type RefreshTokenBodyType = z.infer<typeof RefreshTokenBodySchema>
export type RefreshTokenResType = z.infer<typeof RefreshTokenResSchema>
export type LogoutBodyType = z.infer<typeof LogoutBodySchema>
export type LoginBodyType = z.infer<typeof loginBodySchema>
export type LoginResType = z.infer<typeof LoginResSchema>
export type RoleType = z.infer<typeof RoleSchema>
export type ChangePasswordBodyType = z.infer<typeof ChangePasswordBodySchema>
