import { Injectable } from '@nestjs/common'
import { AuthRepository } from '../auth.repo'
import { HashingService } from 'src/infrastructure/crypto/hashing.service'
import { EmailQueue } from 'src/infrastructure/email/email.queue'
import { generateOTP } from '../helpers/otp.helper'
import { parseDurationMs } from '../helpers/duration.helper'
import { AUTH_OTP_MAX_ATTEMPTS, OtpPurpose, OtpPurposeType } from '../auth.constant'
import envConfig from 'src/core/config/envConfig'
import {
  EmailAlreadyExistsException,
  EmailNotFoundException,
  InvalidOTPException,
  OTPExpiredException,
  OtpLockedException
} from '../errors/auth.errors'
import { SendOtpBodyType } from '../schemas/auth-schemas'
import { UserStatus } from 'src/core/models/user.model'
import { AuthMessages } from '../auth.messages'
import { otpEmailRule } from 'src/core/security/constants/rate-limit.constant'
import { OtpRateLimitedException } from 'src/core/security/errors/rate-limit.errors'
import { RateLimitService } from 'src/core/security/services/rate-limit.service'

@Injectable()
export class AuthOtpService {
  // TTL của OTP, đọc từ env `OTP_EXPIRES_IN` (vd "5m") — nguồn sự thật duy nhất.
  private readonly otpExpiryMs = parseDurationMs(envConfig.OTP_EXPIRES_IN)

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly hashingService: HashingService,
    private readonly emailQueue: EmailQueue,
    private readonly rateLimitService: RateLimitService
  ) {}

  async issueOtp(email: string, purpose: OtpPurposeType): Promise<void> {
    // Spec 14 §4: email cooldown/quota is consumed only after validation and business checks have passed.
    // Guest voting already has identity/IP limits in SurveyService; applying this rule would double-limit it
    // and return Error.OtpRateLimited instead of the survey-specific vote limiter error.
    if (purpose !== OtpPurpose.VOTE) {
      const decision = await this.rateLimitService.checkAndConsume(otpEmailRule(email))
      if (!decision.allowed) throw OtpRateLimitedException(decision.retryAfter)
    }

    const code = generateOTP()
    const otpCodeHash = await this.hashingService.hash(code)
    await this.authRepository.createOtpRequest({
      email,
      otpCodeHash,
      purpose,
      expiresAt: new Date(Date.now() + this.otpExpiryMs)
    })

    const expiresInMinutes = Math.max(1, Math.round(this.otpExpiryMs / 60000))
    await this.emailQueue.enqueueOtp({ email, code, expiresInMinutes })
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
