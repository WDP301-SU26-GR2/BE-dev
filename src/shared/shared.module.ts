import { Global, Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { JwtModule } from '@nestjs/jwt'
import { HashingService } from 'src/shared/services/hashing.service'
import { PrismaService } from 'src/shared/services/prisma.service'
import { TokenService } from 'src/shared/services/token.service'
import { AccessTokenGuard } from './guard/access-token.guard'
import { AuthenticationGuard } from './guard/authentication.guard'
import { EmailService } from './services/otp.service'
import { SharedUsersRepository } from './repositories/shared-users.repo'

const sharedModules = [PrismaService, HashingService, TokenService, EmailService, SharedUsersRepository]

@Global()
@Module({
  exports: [...sharedModules],
  providers: [
    ...sharedModules,
    AccessTokenGuard, // Đăng ký AccessTokenGuard để có thể sử dụng trong AuthenticationGuard
    {
      provide: APP_GUARD,
      useClass: AuthenticationGuard
    }
  ],
  imports: [JwtModule]
})
export class SharedModule {}
