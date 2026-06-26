import { Injectable, Logger } from '@nestjs/common'
import { AuthRepository } from '../auth.repo'
import { HashingService } from 'src/infrastructure/crypto/hashing.service'
import { EmailService } from 'src/infrastructure/email/email.service'
import { generateOTP } from '../helpers/otp.helper'
import { parseDurationMs } from '../helpers/duration.helper'
import { AUTH_OTP_MAX_ATTEMPTS, OtpPurpose, OtpPurposeType } from '../auth.constant'
import envConfig from 'src/core/config/envConfig'
import {
  EmailAlreadyExistsException,
  EmailNotFoundException,
  FailedToSendOTPException,
  InvalidOTPException,
  OTPExpiredException,
  OtpLockedException
} from '../errors/auth.errors'
import { SendOtpBodyType } from '../schemas/auth-schemas'
import { UserStatus } from 'src/core/models/user.model'
import { AuthMessages } from '../auth.messages'

@Injectable()
export class AuthOtpService {
  private readonly logger = new Logger(AuthOtpService.name)
  // TTL của OTP, đọc từ env `OTP_EXPIRES_IN` (vd "5m") — nguồn sự thật duy nhất.
  private readonly otpExpiryMs = parseDurationMs(envConfig.OTP_EXPIRES_IN)

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly hashingService: HashingService,
    private readonly emailService: EmailService
  ) {}

  async issueOtp(email: string, purpose: OtpPurposeType): Promise<void> {
    const code = generateOTP()
    const otpCodeHash = await this.hashingService.hash(code)
    await this.authRepository.createOtpRequest({
      email,
      otpCodeHash,
      purpose,
      expiresAt: new Date(Date.now() + this.otpExpiryMs)
    })

    const expiresInMinutes = Math.max(1, Math.round(this.otpExpiryMs / 60000))
    const { error } = await this.emailService.sendOTP({ email, code, expiresInMinutes })
    if (error) {
      this.logger.error('Failed to send OTP', { error: error.message, email })
      throw FailedToSendOTPException
    }
  }

  async sendOTPService(body: SendOtpBodyType) {
    const user = await this.authRepository.findUserByEmail(body.email)

    if (body.purpose === OtpPurpose.REGISTER) {
      if (!user) throw EmailNotFoundException
      if (user.status === UserStatus.ACTIVE) throw EmailAlreadyExistsException
    }

    if (body.purpose === OtpPurpose.FORGOT_PASSWORD && !user) {
      throw EmailNotFoundException
    }

    if (body.purpose === OtpPurpose.SIGNING_CONTRACT && !user) {
      throw EmailNotFoundException
    }

    await this.issueOtp(body.email, body.purpose)
    return { message: AuthMessages.response.otpSent }
  }

  async validateOtpCode({ email, code, purpose }: { email: string; code: string; purpose: OtpPurposeType }) {
    const otpRequest = await this.authRepository.findOtpRequest({ email, purpose })
    if (!otpRequest) {
      throw InvalidOTPException
    }

    if (otpRequest.expiresAt < new Date()) {
      throw OTPExpiredException
    }

    if (otpRequest.attempts >= AUTH_OTP_MAX_ATTEMPTS) {
      throw OtpLockedException
    }

    const matches = await this.hashingService.compare(code, otpRequest.otpCodeHash)
    if (!matches) {
      await this.authRepository.incrementOtpAttempts({ email, purpose })
      throw InvalidOTPException
    }

    return otpRequest
  }

  async burnOtp(email: string, purpose: OtpPurposeType): Promise<void> {
    await this.authRepository.deleteOtpRequest({ email, purpose })
  }
}
