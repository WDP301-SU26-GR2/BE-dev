import { ConflictException, Injectable } from '@nestjs/common'
import { AuthRepository } from '../auth.repo'
import { HashingService } from 'src/infrastructure/crypto/hashing.service'
import { AuthOtpService } from './auth-otp.service'
import { RoleService } from './role.service'
import { isUniqueConstrainError } from 'src/infrastructure/database/prisma-error.helper'
import { OtpPurpose } from '../auth.constant'
import { UserStatus } from 'src/core/models/user.model'
import { EmailAlreadyVerifiedException, EmailNotFoundException } from '../errors/auth.errors'
import { RegisterBodyType, VerifyEmailBodyType } from '../schemas/auth-schemas'
import { AuthMessages } from '../auth.messages'

@Injectable()
export class AuthRegistrationService {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly hashingService: HashingService,
    private readonly otpService: AuthOtpService,
    private readonly rolesService: RoleService
  ) {}

  async registerService(body: RegisterBodyType) {
    const roleId = await this.rolesService.getRoleIdByCode(body.type)
    const passwordHash = await this.hashingService.hash(body.password)

    try {
      await this.authRepository.createUser({
        email: body.email,
        name: body.name,
        phoneNumber: body.phoneNumber,
        password: passwordHash,
        roleId,
        status: UserStatus.INACTIVE,
        displayName: body.displayName
      })
    } catch (error) {
      if (isUniqueConstrainError(error)) {
        throw new ConflictException('Error.EmailAlreadyExists')
      }
      throw error
    }

    await this.otpService.issueOtp(body.email, OtpPurpose.REGISTER)
    return { message: AuthMessages.response.registered }
  }

  async verifyEmailService(body: VerifyEmailBodyType) {
    const user = await this.authRepository.findUserByEmail(body.email)
    if (!user) {
      throw EmailNotFoundException
    }

    if (user.emailVerified) {
      throw EmailAlreadyVerifiedException
    }

    await this.otpService.validateOtpCode({
      email: body.email,
      code: body.code,
      purpose: OtpPurpose.REGISTER
    })
    await this.authRepository.activateUser(user.id)
    await this.authRepository.deleteOtpRequest({ email: body.email, purpose: OtpPurpose.REGISTER })

    return { message: AuthMessages.response.emailVerified }
  }
}
