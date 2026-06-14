import { Injectable } from '@nestjs/common'
import { AuthRepository } from '../auth.repo'
import { HashingService } from 'src/shared/services/hashing.service'
import { TokenService } from 'src/shared/services/token.service'
import { isNotFoundError } from 'src/shared/helpers/helper.prisma'
import { UserStatus } from 'src/shared/constant/auth.constant'
import { JwtRefreshTokenPayload } from 'src/shared/types/jwt.type'
import { UserType } from 'src/shared/models/shared-user.model'
import {
  AccountBannedException,
  EmailNotFoundException,
  InvalidPasswordException,
  RefreshTokenAlreadyUsedException,
  UnauthorizedAccessException
} from '../errors/auth.errors'
import { LoginBodyType, LogoutBodyType, RefreshTokenBodyType } from '../schemas/auth-schemas'
import { RoleType } from '../schemas/auth.model'

@Injectable()
export class AuthTokenService {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly hashingService: HashingService,
    private readonly tokenService: TokenService
  ) {}

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
