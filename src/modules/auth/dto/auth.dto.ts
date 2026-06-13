import { createZodDto } from 'nestjs-zod'
import {
  ChangePasswordBodySchema,
  ForgotPasswordBodySchema,
  loginBodySchema,
  LoginResSchema,
  LogoutBodySchema,
  RefreshTokenBodySchema,
  RefreshTokenResSchema,
  RegisterBodySchema,
  SendOtpBodySchema
} from '../schemas/auth.model'

export class RegisterBodyDto extends createZodDto(RegisterBodySchema) {}
export class SendOtpBodyDto extends createZodDto(SendOtpBodySchema) {}
export class LoginBodyDto extends createZodDto(loginBodySchema) {}
export class LoginResDto extends createZodDto(LoginResSchema) {}
export class RefreshTokenBodyDto extends createZodDto(RefreshTokenBodySchema) {}
export class RefreshTokenResDto extends createZodDto(RefreshTokenResSchema) {}
export class LogoutBodyDto extends createZodDto(LogoutBodySchema) {}
export class ForgotPasswordBodyDto extends createZodDto(ForgotPasswordBodySchema) {}
export class ChangePasswordBodyDto extends createZodDto(ChangePasswordBodySchema) {}
