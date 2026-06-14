import { Global, Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { JwtModule } from '@nestjs/jwt'
import { HashingService } from 'src/infrastructure/crypto/hashing.service'
import { PrismaService } from 'src/infrastructure/database/prisma.service'
import { TokenService } from 'src/infrastructure/token/token.service'
import { AccessTokenGuard } from './security/guards/access-token.guard'
import { AuthenticationGuard } from './security/guards/authentication.guard'
import { RolesGuard } from './security/guards/roles.guard'
import { EmailService } from 'src/infrastructure/email/email.service'

const infrastructureServices = [PrismaService, HashingService, TokenService, EmailService]

@Global()
@Module({
  exports: [...infrastructureServices],
  providers: [
    ...infrastructureServices,
    AccessTokenGuard, // ÄÄƒng kÃ½ AccessTokenGuard Ä‘á»ƒ cÃ³ thá»ƒ sá»­ dá»¥ng trong AuthenticationGuard
    {
      provide: APP_GUARD,
      useClass: AuthenticationGuard
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard
    }
  ],
  imports: [JwtModule]
})
export class CoreModule {}
