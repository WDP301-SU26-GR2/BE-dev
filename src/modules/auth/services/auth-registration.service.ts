import { ConflictException, Injectable } from '@nestjs/common'
import { AuthRepository } from '../auth.repo'
import { HashingService } from 'src/shared/security/hashing.service'
import { AuthOtpService } from './auth-otp.service'
import { RoleService } from './role.service'
import { isUniqueConstrainError } from 'src/shared/database/prisma-error.helper'
import { OtpPurpose, UserStatus } from 'src/shared/constant/auth.constant'
import { RoleName } from 'src/shared/security/role.constant'
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
      //Kiểm tra mã OTP:
      await this.otpService.validateOtpCode({
        email: body.email,
        otpCodeHash: body.code,
        purpose: OtpPurpose.REGISTER
      })
      //Kiểm tra mật khẩu và mật khẩu xác nhận không khớp:
      if (body.password !== body.confirm_password) {
        throw new ConflictException('Password and confirm password do not match')
      }
      //Lấy id vai trò:
      const role =
        body.type === RoleName.MANGAKA
          ? await this.rolesService.getMangakaRoleId()
          : await this.rolesService.getAssistantRoleId()
      //Hash mật khẩu:
      const passwordHash = await this.hashingService.hash(body.password)
      //Tạo user và xóa mã OTP đã sử dụng khỏi DB:
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
        //Xóa mã OTP đã sử dụng khỏi DB:
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
