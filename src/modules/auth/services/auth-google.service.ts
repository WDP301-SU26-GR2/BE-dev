import { Injectable } from '@nestjs/common'
import { AuthRepository } from '../auth.repo'
import { AuthTokenService } from './auth-token.service'
import { GoogleTokenVerifier, GoogleIdTokenPayload } from 'src/infrastructure/oauth/google-token-verifier.service'
import { UserStatus } from 'src/core/models/user.model'
import {
  AccountBannedException,
  EmailNotVerifiedException,
  GoogleAccountMismatchException,
  GoogleAccountNotRegisteredException,
  GoogleEmailNotVerifiedException,
  InvalidGoogleTokenException
} from '../errors/auth.errors'
import { GoogleLoginBodyType } from '../schemas/auth-schemas'

@Injectable()
export class AuthGoogleService {
  constructor(
    private readonly googleTokenVerifier: GoogleTokenVerifier,
    private readonly authRepository: AuthRepository,
    private readonly authTokenService: AuthTokenService
  ) {}

  async googleLoginService(body: GoogleLoginBodyType) {
    const payload = await this.verifyOrThrow(body.idToken)

    if (!payload.emailVerified) {
      throw GoogleEmailNotVerifiedException
    }

    const email = payload.email.trim().toLowerCase()
    const user = await this.authRepository.findUserWithRole({ email })
    if (!user) {
      throw GoogleAccountNotRegisteredException
    }
    if (user.status === UserStatus.BANNED || user.status === UserStatus.BLOCKED) {
      throw AccountBannedException
    }
    if (!user.emailVerified || user.status !== UserStatus.ACTIVE) {
      throw EmailNotVerifiedException
    }

    if (!user.googleId) {
      await this.authRepository.setGoogleId(user.id, payload.sub)
    } else if (user.googleId !== payload.sub) {
      throw GoogleAccountMismatchException
    }

    return this.authTokenService.issueSession(user)
  }

  private async verifyOrThrow(idToken: string): Promise<GoogleIdTokenPayload> {
    try {
      return await this.googleTokenVerifier.verify(idToken)
    } catch {
      throw InvalidGoogleTokenException
    }
  }
}
