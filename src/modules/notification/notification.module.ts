import { Global, Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { QUEUE } from 'src/infrastructure/queue/queue.constant'
import { NotificationService } from './notification.service'
import { NotificationRepository } from './notification.repo'
import { NotificationProcessor } from './notification.processor'
import { NotificationQueue } from './notification.queue'
import { NotificationController } from './notification.controller'
import { NotificationReadService } from './services/notification-read.service'

// @Global: notify(...) is a cross-cutting shared service (S0-5) — every module
// (BE-A series/chapter/task + BE-B contract/board/...) can inject NotificationService
// without importing NotificationModule explicitly.
@Global()
@Module({
  imports: [BullModule.registerQueue({ name: QUEUE.NOTIFICATION, forceDisconnectOnShutdown: true })],
  controllers: [NotificationController],
  providers: [
    NotificationService,
    NotificationRepository,
    NotificationQueue,
    NotificationProcessor,
    NotificationReadService
  ],
  exports: [NotificationService, NotificationQueue]
})
export class NotificationModule {}
