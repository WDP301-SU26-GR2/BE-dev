import { Module } from '@nestjs/common'
import { AuthController } from './auth.controller'
import { AuthService } from './services/auth.service'
import { RoleService } from './services/role.service'
import { AuthRepository } from './auth.repo'
import { AuthRegistrationService } from './services/auth-registration.service'
import { AuthOtpService } from './services/auth-otp.service'
import { AuthPasswordService } from './services/auth-password.service'
import { AuthTokenService } from './services/auth-token.service'
import { AuthGoogleService } from './services/auth-google.service'
import { GoogleTokenVerifier } from 'src/infrastructure/oauth/google-token-verifier.service'

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    RoleService,
    AuthRepository,
    AuthRegistrationService,
    AuthOtpService,
    AuthPasswordService,
    AuthTokenService,
    AuthGoogleService,
    GoogleTokenVerifier
  ]
})
export class AuthModule {}
