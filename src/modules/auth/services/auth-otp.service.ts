import { Injectable, Logger } from '@nestjs/common'
import { AuthRepository } from '../auth.repo'
import { EmailService } from 'src/shared/services/email.service'
import { generateOTP } from 'src/shared/helpers/helperOtp'
import { OtpPurpose, OtpPurposeType } from 'src/shared/constant/auth.constant'
import {
  FailedToSendOTPException,
  InvalidOTPException,
  OTPExpiredException,
  EmailAlreadyExistsException,
  EmailNotFoundException
} from '../errors/auth.errors'
import { SendOtpBodyType } from '../schemas/auth-schemas'

@Injectable()
export class AuthOtpService {
  private readonly logger = new Logger(AuthOtpService.name)

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly emailService: EmailService
  ) {}

  async sendOTPService(body: SendOtpBodyType) {
    const user = await this.authRepository.findUserByEmail(body.email)
    if (body.purpose === OtpPurpose.REGISTER && user) {
      throw EmailAlreadyExistsException
    }
    if (body.purpose === OtpPurpose.FORGOT_PASSWORD && !user) {
      throw EmailNotFoundException
    }
    const code = generateOTP()
    await this.authRepository.createOtpRequest({
      email: body.email,
      otpCodeHash: code,
      purpose: body.purpose,
      expiresAt: new Date(Date.now() + 1000 * 60 * 10)
    })
    const { error } = await this.emailService.sendOTP({
      email: body.email,
      code
    })
    if (error) {
      this.logger.error('Failed to send OTP', { error: error.message, email: body.email })
      throw FailedToSendOTPException
    }
    return {
      message: 'OTP sent successfully'
    }
  }

  async validateOtpCode({
    email,
    otpCodeHash,
    purpose
  }: {
    email: string
    otpCodeHash: string
    purpose: OtpPurposeType
  }) {
    const otpRequest = await this.authRepository.findOtpRequest({
      email_purpose_otpCodeHash: {
        email: email,
        otpCodeHash: otpCodeHash,
        purpose: purpose
      }
    })
    if (!otpRequest) {
      throw InvalidOTPException
    }

    if (otpRequest.attempts > 5 || otpRequest.expiresAt < new Date()) {
      throw OTPExpiredException
    }

    return otpRequest
  }
}
