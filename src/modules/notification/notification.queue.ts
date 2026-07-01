import { Injectable, Logger } from '@nestjs/common'
import { JOB, QUEUE } from 'src/infrastructure/queue/queue.constant'
import { QueueService } from 'src/infrastructure/queue/queue.service'
import { NotificationService, NotifyInput } from './notification.service'

@Injectable()
export class NotificationQueue {
  private readonly logger = new Logger(NotificationQueue.name)

  constructor(
    private readonly queueService: QueueService,
    private readonly notificationService: NotificationService
  ) {}

  async enqueue(input: NotifyInput): Promise<void> {
    try {
      await this.queueService.enqueue(QUEUE.NOTIFICATION, JOB.DISPATCH_NOTIFICATION, input)
    } catch (err) {
      this.logger.error('enqueue notification failed, fallback sync', err as Error)
      await this.notificationService.notifySafe(input)
    }
  }
}
