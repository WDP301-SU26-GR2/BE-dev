import { z } from 'zod'
import { UserSchema } from 'src/shared/models/shared-user.model'
import { OtpPurpose } from 'src/shared/constant/auth.constant'
import { RoleName } from 'src/shared/security/role.constant'
import { extendApi } from '@anatine/zod-openapi'
import { OtpCodeSchema } from './auth.model'

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

//OTP — uses OtpCodeSchema.pick (matching current behavior)
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

// Inferred types
export type SendOtpBodyType = z.infer<typeof SendOtpBodySchema>
export type RegisterBodyType = z.infer<typeof RegisterBodySchema>
export type ForgotPasswordBodyType = z.infer<typeof ForgotPasswordBodySchema>
export type RefreshTokenBodyType = z.infer<typeof RefreshTokenBodySchema>
export type RefreshTokenResType = z.infer<typeof RefreshTokenResSchema>
export type LogoutBodyType = z.infer<typeof LogoutBodySchema>
export type LoginBodyType = z.infer<typeof loginBodySchema>
export type LoginResType = z.infer<typeof LoginResSchema>
export type ChangePasswordBodyType = z.infer<typeof ChangePasswordBodySchema>
