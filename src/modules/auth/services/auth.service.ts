import { ConflictException, Injectable, Logger } from '@nestjs/common'
import { EmailService } from 'src/shared/services/email.service'
import { SendOtpBodyDto } from '../dto/auth.dto'
import { SharedUsersRepository } from 'src/shared/repositories/shared-users.repo'
import { OtpPurpose, OtpPurposeType, UserStatus } from 'src/shared/constant/auth.constant'
import {
  AccountBannedException,
  EmailAlreadyExistsException,
  EmailNotFoundException,
  FailedToSendOTPException,
  InvalidOTPException,
  InvalidPasswordException,
  OTPExpiredException,
  RefreshTokenAlreadyUsedException,
  UnauthorizedAccessException
} from '../errors/auth.errors'
import { generateOTP } from 'src/shared/helpers/helperOtp'
import { AuthRepository } from '../auth.repo'
import {
  ChangePasswordBodyType,
  ForgotPasswordBodyType,
  LoginBodyType,
  LogoutBodyType,
  RefreshTokenBodyType,
  RegisterBodyType
} from '../schemas/auth-schemas'
import { RoleType } from '../schemas/auth.model'
import { HashingService } from 'src/shared/services/hashing.service'
import { RoleService } from './role.service'
import { isNotFoundError, isUniqueConstrainError } from 'src/shared/helpers/helper.prisma'
import { RoleName } from 'src/shared/constant/role.constant'
import { TokenService } from 'src/shared/services/token.service'
import { JwtRefreshTokenPayload } from 'src/shared/types/jwt.type'
import { UserType } from 'src/shared/models/shared-user.model'

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name)
  constructor(
    private readonly emailService: EmailService,
    private readonly sharedUsersRepository: SharedUsersRepository,
    private readonly authRepository: AuthRepository,
    private readonly rolesService: RoleService,
    private readonly hashingService: HashingService,
    private readonly tokenService: TokenService
  ) {}

  async registerService(body: RegisterBodyType) {
    try {
      //Kiểm tra mã OTP:
      await this.validateOtpCode({
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

  async sendOTPService(body: SendOtpBodyDto) {
    // Kiểm tra email đã tồn tại trong DB user, ko phải trong VerificationCode, vì nếu có tồn tại trong VerificationCode nhưng không tồn tại trong User thì vẫn có thể gửi OTP được, vì có thể người dùng đã gửi OTP nhưng chưa hoàn thành đăng ký, hoặc đã hết hạn OTP và muốn gửi lại OTP mới, nên chúng ta chỉ cần kiểm tra email đã tồn tại trong DB user hay chưa, nếu đã tồn tại thì sẽ không cho phép gửi OTP nữa vì email này đã được sử dụng để đăng ký rồi, nếu chưa tồn tại thì mới cho phép gửi OTP để đăng ký:
    const user = await this.sharedUsersRepository.findUnique({
      email: body.email
    })
    //Type là REGISTER thì sẽ kiểm tra email đã tồn tại trong DB user hay chưa, nếu đã tồn tại thì sẽ không cho phép gửi OTP nữa vì email này đã được sử dụng để đăng ký rồi, nếu chưa tồn tại thì mới cho phép gửi OTP để đăng ký, còn Type là FORGOT_PASSWORD thì sẽ không kiểm tra email đã tồn tại trong DB user hay chưa, vì dù email đó có tồn tại trong DB user hay không thì vẫn có thể gửi OTP được để tránh việc kẻ xấu có thể lợi dụng API gửi OTP để dò tìm xem email nào có tồn tại trong hệ thống và email nào không có tồn tại trong hệ thống, điều này giúp tăng cường bảo mật cho hệ thống của chúng ta:
    if (body.purpose === OtpPurpose.REGISTER && user) {
      throw EmailAlreadyExistsException
    }
    //Type là forgot password thì sẽ kiểm tra email đã tồn tại trong DB user hay chưa, nếu chưa tồn tại thì sẽ không cho phép gửi OTP để tránh việc kẻ xấu có thể lợi dụng API gửi OTP để dò tìm xem email nào có tồn tại trong hệ thống và email nào không có tồn tại trong hệ thống, điều này giúp tăng cường bảo mật cho hệ thống của chúng ta:
    if (body.purpose === OtpPurpose.FORGOT_PASSWORD && !user) {
      throw EmailNotFoundException
    }
    //Tạo mã OTP
    const code = generateOTP()
    //Lưu mã Otp vào DB:
    await this.authRepository.createOtpRequest({
      email: body.email,
      otpCodeHash: code,
      purpose: body.purpose,
      expiresAt: new Date(Date.now() + 1000 * 60 * 10) //10 phút
    })
    //gửi mã OTP qua email cho người dùng:
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

    //Kiểm tra mã OTP đã hết hạn hay chưa:
    if (otpRequest.attempts > 5 || otpRequest.expiresAt < new Date()) {
      throw OTPExpiredException
    }

    return otpRequest
  }

  async loginService(body: LoginBodyType) {
    const user = await this.authRepository.findUserWithRole({ email: body.email })
    if (!user) {
      throw EmailNotFoundException
    }

    if (user.status === UserStatus.BANNED || user.status === UserStatus.BLOCKED) {
      throw AccountBannedException
    }

    const isPasswordMatch = await this.hashingService.compare(body.password, user.password)
    if (!isPasswordMatch) {
      throw InvalidPasswordException
    }

    return await this.generateAuthResponse(user)
  }

  async logoutService(body: LogoutBodyType) {
    try {
      await this.tokenService.verifyRefreshToken(body.refreshToken)
    } catch {
      throw UnauthorizedAccessException
    }

    try {
      await this.authRepository.deleteRefreshToken(body.refreshToken)
    } catch (error) {
      if (isNotFoundError(error)) {
        throw RefreshTokenAlreadyUsedException
      }
      throw error
    }

    return {
      message: 'Logout successfully'
    }
  }

  async refreshTokenService(body: RefreshTokenBodyType) {
    let payload: JwtRefreshTokenPayload
    try {
      payload = await this.tokenService.verifyRefreshToken(body.refreshToken)
    } catch {
      throw UnauthorizedAccessException
    }

    //Xóa refresh token cũ (rotate), nếu không tìm thấy nghĩa là token đã bị dùng/rotate trước đó:
    try {
      await this.authRepository.deleteRefreshToken(body.refreshToken)
    } catch (error) {
      if (isNotFoundError(error)) {
        throw RefreshTokenAlreadyUsedException
      }
      throw error
    }

    const user = await this.authRepository.findUserWithRole({ id: payload.userId })
    if (!user) {
      throw UnauthorizedAccessException
    }

    if (user.status === UserStatus.BANNED || user.status === UserStatus.BLOCKED) {
      throw AccountBannedException
    }

    return await this.generateAuthResponse(user)
  }

  async forgotPasswordService(body: ForgotPasswordBodyType) {
    const user = await this.authRepository.findUserWithRole({ email: body.email })
    if (!user) {
      throw EmailNotFoundException
    }
    if (user.status === UserStatus.BANNED || user.status === UserStatus.BLOCKED) {
      throw AccountBannedException
    }

    await this.validateOtpCode({
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
      //Revoke toàn bộ session hiện có của user sau khi đổi mật khẩu:
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
      //Revoke toàn bộ session hiện có của user sau khi đổi mật khẩu:
      this.authRepository.deleteRefreshTokensByUserId(user.id)
    ])

    return {
      message: 'Password changed successfully'
    }
  }

  private async generateAuthResponse(user: Omit<UserType, 'password'> & { role: Pick<RoleType, 'code'> }) {
    const [accessToken, refreshToken] = await Promise.all([
      this.tokenService.signAccessToken({
        userId: user.id,
        roleName: user.role.code
      }),
      this.tokenService.signRefreshToken({ userId: user.id })
    ])

    const { exp } = this.tokenService.decodeRefreshToken(refreshToken)
    await this.authRepository.createRefreshToken({
      token: refreshToken,
      userId: user.id,
      expiresAt: new Date(exp * 1000)
    })

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        displayName: user.displayName,
        phoneNumber: user.phoneNumber,
        role: user.role.code
      },
      accessToken,
      refreshToken
    }
  }
}
