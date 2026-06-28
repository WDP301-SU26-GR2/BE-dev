import { Injectable } from '@nestjs/common'
import { AuthRepository } from '../auth.repo'
import { HashingService } from 'src/infrastructure/crypto/hashing.service'
import { TokenService } from 'src/infrastructure/token/token.service'
import { isNotFoundError } from 'src/infrastructure/database/prisma-error.helper'
import { JwtRefreshTokenPayload } from 'src/infrastructure/token/jwt.type'
import { UserStatus, UserType } from 'src/core/models/user.model'
import {
  AccountBannedException,
  EmailNotVerifiedException,
  EmailNotFoundException,
  InvalidPasswordException,
  RefreshTokenAlreadyUsedException,
  UnauthorizedAccessException
} from '../errors/auth.errors'
import { LoginBodyType, LogoutBodyType, RefreshTokenBodyType } from '../schemas/auth-schemas'
import { RoleType } from '../schemas/auth.model'
import { AuthMessages } from '../auth.messages'
import { RoleCode } from '@prisma/client'

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

    if (!user.emailVerified || user.status !== UserStatus.ACTIVE) {
      throw EmailNotVerifiedException
    }

    return await this.issueSession(user)
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
      message: AuthMessages.response.loggedOut
    }
  }

  async refreshTokenService(body: RefreshTokenBodyType) {
    let payload: JwtRefreshTokenPayload
    try {
      payload = await this.tokenService.verifyRefreshToken(body.refreshToken)
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

    const user = await this.authRepository.findUserWithRole({ id: payload.userId })
    if (!user) {
      throw UnauthorizedAccessException
    }

    if (user.status === UserStatus.BANNED || user.status === UserStatus.BLOCKED) {
      throw AccountBannedException
    }

    if (!user.emailVerified || user.status !== UserStatus.ACTIVE) {
      throw EmailNotVerifiedException
    }

    return await this.issueSession(user)
  }

  async issueSession(user: Omit<UserType, 'password'> & { role: Pick<RoleType, 'code'> }) {
    const [accessToken, refreshToken] = await Promise.all([
      this.tokenService.signAccessToken({
        userId: user.id,
        email: user.email,
        roleName: user.role.code,
        mustChangePassword: user.mustChangePassword
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
        role: user.role.code as RoleCode
      },
      mustChangePassword: user.mustChangePassword,
      accessToken,
      refreshToken
    }
  }
}
