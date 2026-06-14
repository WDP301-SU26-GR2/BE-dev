import { Injectable, Logger } from '@nestjs/common'
import { EmailService } from 'src/shared/services/email.service'
import { OtpPurposeType } from 'src/shared/constant/auth.constant'
import { AuthRepository } from '../auth.repo'
import {
  ChangePasswordBodyType,
  ForgotPasswordBodyType,
  LoginBodyType,
  LogoutBodyType,
  RefreshTokenBodyType,
  RegisterBodyType,
  SendOtpBodyType
} from '../schemas/auth-schemas'
import { HashingService } from 'src/shared/services/hashing.service'
import { RoleService } from './role.service'
import { TokenService } from 'src/shared/services/token.service'
import { AuthRegistrationService } from './auth-registration.service'
import { AuthOtpService } from './auth-otp.service'
import { AuthPasswordService } from './auth-password.service'
import { AuthTokenService } from './auth-token.service'

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name)
  constructor(
    private readonly emailService: EmailService,
    private readonly authRepository: AuthRepository,
    private readonly rolesService: RoleService,
    private readonly hashingService: HashingService,
    private readonly tokenService: TokenService,
    private readonly registrationService: AuthRegistrationService,
    private readonly otpService: AuthOtpService,
    private readonly passwordService: AuthPasswordService,
    private readonly tokenUseCaseService: AuthTokenService
  ) {}

  registerService(body: RegisterBodyType) {
    return this.registrationService.registerService(body)
  }

  sendOTPService(body: SendOtpBodyType) {
    return this.otpService.sendOTPService(body)
  }

  validateOtpCode(params: { email: string; otpCodeHash: string; purpose: OtpPurposeType }) {
    return this.otpService.validateOtpCode(params)
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
