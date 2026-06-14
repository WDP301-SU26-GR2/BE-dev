import { Injectable } from '@nestjs/common'
import { AuthRepository } from '../auth.repo'
import { HashingService } from 'src/infrastructure/crypto/hashing.service'
import { AuthOtpService } from './auth-otp.service'
import { OtpPurpose } from '../auth.constant'
import { UserStatus } from 'src/core/models/user.model'
import { AccountBannedException, EmailNotFoundException, InvalidPasswordException } from '../errors/auth.errors'
import { ChangePasswordBodyType, ForgotPasswordBodyType } from '../schemas/auth-schemas'

@Injectable()
export class AuthPasswordService {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly hashingService: HashingService,
    private readonly otpService: AuthOtpService
  ) {}

  async forgotPasswordService(body: ForgotPasswordBodyType) {
    const user = await this.authRepository.findUserWithRole({ email: body.email })
    if (!user) {
      throw EmailNotFoundException
    }
    if (user.status === UserStatus.BANNED || user.status === UserStatus.BLOCKED) {
      throw AccountBannedException
    }

    await this.otpService.validateOtpCode({
      email: body.email,
      otpCodeHash: body.code,
      purpose: OtpPurpose.FORGOT_PASSWORD
    })

    const hashedPassword = await this.hashingService.hash(body.newPassword)
    await Promise.all([
      this.authRepository.updateUserPassword(user.id, hashedPassword),
      this.authRepository.deleteOtpRequest({
        email_purpose_otpCodeHash: {
          email: body.email,
          otpCodeHash: body.code,
          purpose: OtpPurpose.FORGOT_PASSWORD
        }
      }),
      this.authRepository.deleteRefreshTokensByUserId(user.id)
    ])

    return {
      message: 'Password reset successfully'
    }
  }

  async changePasswordService(body: ChangePasswordBodyType, userId: string) {
    const user = await this.authRepository.findUserWithRole({ id: userId })
    if (!user) {
      throw EmailNotFoundException
    }

    const isPasswordMatch = await this.hashingService.compare(body.currentPassword, user.password)
    if (!isPasswordMatch) {
      throw InvalidPasswordException
    }

    const hashedPassword = await this.hashingService.hash(body.newPassword)
    await Promise.all([
      this.authRepository.updateUserPassword(user.id, hashedPassword),
      this.authRepository.deleteRefreshTokensByUserId(user.id)
    ])

    return {
      message: 'Password changed successfully'
    }
  }
}
