import { Global, Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import type { QueueOptions } from 'bullmq'
import type { Redis } from 'ioredis'
import { REDIS_BULL_CONNECTION } from 'src/infrastructure/redis/redis.constant'
import { RedisModule } from 'src/infrastructure/redis/redis.module'
import { QueueService } from './queue.service'
import { ObservabilityModule } from 'src/core/observability/observability.module'
import { QueueProcessorMetricsService } from './queue-processor-metrics.service'
import { QueueDepthMetricsService } from './queue-depth-metrics.service'

@Global()
@Module({
  imports: [
    ObservabilityModule,
    BullModule.forRootAsync({
      imports: [RedisModule],
      inject: [REDIS_BULL_CONNECTION],
      useFactory: (connection: Redis): QueueOptions => ({
        connection: connection
      })
    })
  ],
  providers: [QueueService, QueueProcessorMetricsService, QueueDepthMetricsService],
  exports: [QueueService, QueueProcessorMetricsService, QueueDepthMetricsService, BullModule]
})
export class QueueModule {}
