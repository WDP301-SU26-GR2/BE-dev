import { ConflictException, Injectable } from '@nestjs/common'
import { AuthRepository } from '../auth.repo'
import { HashingService } from 'src/infrastructure/crypto/hashing.service'
import { AuthOtpService } from './auth-otp.service'
import { RoleService } from './role.service'
import { isUniqueConstrainError } from 'src/infrastructure/database/prisma-error.helper'
import { OtpPurpose } from '../auth.constant'
import { UserStatus } from 'src/core/models/user.model'
import { RoleName } from 'src/core/security/role.constant'
import { EmailAlreadyExistsException } from '../errors/auth.errors'
import { RegisterBodyType } from '../schemas/auth-schemas'

@Injectable()
export class AuthRegistrationService {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly hashingService: HashingService,
    private readonly otpService: AuthOtpService,
    private readonly rolesService: RoleService
  ) {}

  async registerService(body: RegisterBodyType) {
    try {
      await this.otpService.validateOtpCode({
        email: body.email,
        otpCodeHash: body.code,
        purpose: OtpPurpose.REGISTER
      })
      if (body.password !== body.confirm_password) {
        throw new ConflictException('Password and confirm password do not match')
      }
      const role =
        body.type === RoleName.MANGAKA
          ? await this.rolesService.getMangakaRoleId()
          : await this.rolesService.getAssistantRoleId()
      const passwordHash = await this.hashingService.hash(body.password)
      await Promise.all([
        this.authRepository.createUser({
          email: body.email,
          name: body.name,
          phoneNumber: body.phoneNumber,
          password: passwordHash,
          roleId: role,
          status: UserStatus.ACTIVE,
          displayName: body.displayName
        }),
        this.authRepository.deleteOtpRequest({
          email_purpose_otpCodeHash: {
            email: body.email,
            otpCodeHash: body.code,
            purpose: OtpPurpose.REGISTER
          }
        })
      ])
      return {
        message: 'User created successfully'
      }
    } catch (error) {
      if (isUniqueConstrainError(error)) {
        throw EmailAlreadyExistsException
      }
      throw error
    }
  }
}
