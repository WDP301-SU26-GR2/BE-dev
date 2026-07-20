import { Global, Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import type { QueueOptions } from 'bullmq'
import type { Redis } from 'ioredis'
import { REDIS_BULL_CONNECTION } from 'src/infrastructure/redis/redis.constant'
import { RedisModule } from 'src/infrastructure/redis/redis.module'
import { QueueService } from './queue.service'

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [RedisModule],
      inject: [REDIS_BULL_CONNECTION],
      // Jest e2e only verifies the HTTP composition root. Registering background workers there
      // creates blocking Redis sockets unrelated to the assertion and prevents a clean CI exit.
      // Unit/flow suites exercise the processors separately; production registration is unchanged.
      extraOptions: { manualRegistration: process.env.NODE_ENV === 'test' },
      useFactory: (connection: Redis): QueueOptions => ({
        connection: connection as unknown as QueueOptions['connection']
      })
    })
  ],
  providers: [QueueService],
  exports: [QueueService, BullModule]
})
export class QueueModule {}
