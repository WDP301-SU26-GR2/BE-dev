import { Global, Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { JwtModule } from '@nestjs/jwt'
import { HashingService } from 'src/shared/security/hashing.service'
import { PrismaService } from 'src/shared/database/prisma.service'
import { TokenService } from 'src/shared/security/token.service'
import { AccessTokenGuard } from './security/guards/access-token.guard'
import { AuthenticationGuard } from './security/guards/authentication.guard'
import { EmailService } from './email/email.service'

const sharedModules = [PrismaService, HashingService, TokenService, EmailService]

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
