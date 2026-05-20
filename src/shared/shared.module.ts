import { Global, Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { HashingService } from 'src/shared/services/hashing.service'
import { PrismaService } from 'src/shared/services/prisma.service'
import { TokenService } from 'src/shared/services/token.service'

const sharedModules = [PrismaService, HashingService, TokenService]

@Global()
@Module({
  exports: [...sharedModules],
  providers: [...sharedModules],
  imports: [JwtModule],
})
export class SharedModule {}
