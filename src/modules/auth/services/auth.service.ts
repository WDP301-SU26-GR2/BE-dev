import { Injectable } from '@nestjs/common'
import {
  ChangePasswordBodyType,
  ForgotPasswordBodyType,
  LoginBodyType,
  LogoutBodyType,
  RefreshTokenBodyType,
  RegisterBodyType,
  SendOtpBodyType,
  VerifyEmailBodyType
} from '../schemas/auth-schemas'
import { AuthRegistrationService } from './auth-registration.service'
import { AuthOtpService } from './auth-otp.service'
import { AuthPasswordService } from './auth-password.service'
import { AuthTokenService } from './auth-token.service'

@Injectable()
export class AuthService {
  constructor(
    private readonly registrationService: AuthRegistrationService,
    private readonly otpService: AuthOtpService,
    private readonly passwordService: AuthPasswordService,
    private readonly tokenUseCaseService: AuthTokenService
  ) {}

  registerService(body: RegisterBodyType) {
    return this.registrationService.registerService(body)
  }

  verifyEmailService(body: VerifyEmailBodyType) {
    return this.registrationService.verifyEmailService(body)
  }

  sendOTPService(body: SendOtpBodyType) {
    return this.otpService.sendOTPService(body)
  }

  loginService(body: LoginBodyType) {
    return this.tokenUseCaseService.loginService(body)
  }

  logoutService(body: LogoutBodyType) {
    return this.tokenUseCaseService.logoutService(body)
  }

  refreshTokenService(body: RefreshTokenBodyType) {
    return this.tokenUseCaseService.refreshTokenService(body)
  }

  forgotPasswordService(body: ForgotPasswordBodyType) {
    return this.passwordService.forgotPasswordService(body)
  }

  changePasswordService(body: ChangePasswordBodyType, userId: string) {
    return this.passwordService.changePasswordService(body, userId)
  }
}
