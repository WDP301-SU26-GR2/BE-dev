import { Global, Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { JwtModule } from '@nestjs/jwt'
import { HashingService } from 'src/shared/services/hashing.service'
import { PrismaService } from 'src/shared/database/prisma.service'
import { TokenService } from 'src/shared/services/token.service'
import { AccessTokenGuard } from './guards/access-token.guard'
import { AuthenticationGuard } from './guards/authentication.guard'
import { EmailService } from './services/email.service'

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
