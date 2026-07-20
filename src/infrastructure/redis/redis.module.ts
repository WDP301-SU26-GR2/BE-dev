import { Global, Module } from '@nestjs/common'
import { Redis } from 'ioredis'
import envConfig from 'src/core/config/envConfig'
import {
  BULL_REDIS_OPTIONS,
  GENERAL_REDIS_OPTIONS,
  REDIS_BULL_CONNECTION,
  REDIS_CLIENT,
  REDIS_WS_CONNECTION,
  WS_REDIS_OPTIONS
} from './redis.constant'
import { RedisService } from './redis.service'
import { CacheService } from './cache.service'
import { RedisConnectionsLifecycle } from './redis-connections.lifecycle'

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: () => new Redis(envConfig.REDIS_URL, GENERAL_REDIS_OPTIONS)
    },
    {
      provide: REDIS_BULL_CONNECTION,
      useFactory: () => new Redis(envConfig.REDIS_URL, BULL_REDIS_OPTIONS)
    },
    {
      provide: REDIS_WS_CONNECTION,
      useFactory: () => new Redis(envConfig.REDIS_URL, WS_REDIS_OPTIONS)
    },
    RedisService,
    CacheService,
    RedisConnectionsLifecycle
  ],
  exports: [RedisService, CacheService, REDIS_CLIENT, REDIS_BULL_CONNECTION, REDIS_WS_CONNECTION]
})
export class RedisModule {}
