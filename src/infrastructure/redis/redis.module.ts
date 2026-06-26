import { Global, Module } from '@nestjs/common'
import { Redis } from 'ioredis'
import envConfig from 'src/core/config/envConfig'
import { REDIS_BULL_CONNECTION, REDIS_CLIENT } from './redis.constant'
import { RedisService } from './redis.service'

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: () =>
        new Redis(envConfig.REDIS_URL, {
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
          connectTimeout: 3000
        })
    },
    {
      provide: REDIS_BULL_CONNECTION,
      useFactory: () =>
        new Redis(envConfig.REDIS_URL, {
          maxRetriesPerRequest: null,
          enableReadyCheck: false
        })
    },
    RedisService
  ],
  exports: [RedisService, REDIS_CLIENT, REDIS_BULL_CONNECTION]
})
export class RedisModule {}
