import { Global, Module } from '@nestjs/common'
import { NotificationService } from './notification.service'
import { NotificationRepository } from './notification.repo'

// @Global: notify(...) is a cross-cutting shared service (S0-5) — every module
// (BE-A series/chapter/task + BE-B contract/board/...) can inject NotificationService
// without importing NotificationModule explicitly.
@Global()
@Module({
  providers: [NotificationService, NotificationRepository],
  exports: [NotificationService]
})
export class NotificationModule {}
