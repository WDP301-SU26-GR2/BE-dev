import { Global, Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { JwtModule } from '@nestjs/jwt'
import { HashingService } from 'src/infrastructure/crypto/hashing.service'
import { IdentityHashService, IDENTITY_HASH_PEPPER } from 'src/infrastructure/crypto/identity-hash.service'
import envConfig from './config/envConfig'
import { PrismaService } from 'src/infrastructure/database/prisma.service'
import { TokenService } from 'src/infrastructure/token/token.service'
import { AccessTokenGuard } from './security/guards/access-token.guard'
import { AuthenticationGuard } from './security/guards/authentication.guard'
import { PasswordPolicyGuard } from './security/guards/password-policy.guard'
import { RolesGuard } from './security/guards/roles.guard'
import { EmailService } from 'src/infrastructure/email/email.service'
import { DomainEventBus } from './events/domain-event-bus.service'
import { StorageService } from 'src/infrastructure/storage/storage.service'
import { RedisModule } from 'src/infrastructure/redis/redis.module'
import { QueueModule } from 'src/infrastructure/queue/queue.module'
import { RateLimitService } from './security/services/rate-limit.service'
import { RequestContextService } from './observability/request-context.service'
import { RequestIdMiddleware } from './observability/request-id.middleware'
import { DatabaseUnitOfWork } from 'src/infrastructure/database/database-unit-of-work.service'
import { OutboxRepo } from 'src/infrastructure/database/outbox.repo'
import { ObservabilityModule } from './observability/observability.module'

const infrastructureServices = [
  PrismaService,
  HashingService,
  IdentityHashService,
  TokenService,
  EmailService,
  DomainEventBus,
  StorageService,
  RequestContextService,
  DatabaseUnitOfWork,
  OutboxRepo
]

@Global()
@Module({
  exports: [...infrastructureServices, ObservabilityModule, RedisModule, QueueModule, RateLimitService],
  providers: [
    ...infrastructureServices,
    { provide: IDENTITY_HASH_PEPPER, useValue: envConfig.IDENTITY_HASH_PEPPER },
    RateLimitService,
    RequestIdMiddleware,
    AccessTokenGuard,
    {
      provide: APP_GUARD,
      useClass: AuthenticationGuard
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard
    },
    {
      provide: APP_GUARD,
      useClass: PasswordPolicyGuard
    }
  ],
  // EventEmitterModule.forRoot() được đăng ký DUY NHẤT ở AppModule (composition root) — S-07 audit 2026-07-20.
  imports: [JwtModule, ObservabilityModule, RedisModule, QueueModule]
})
export class CoreModule {}
