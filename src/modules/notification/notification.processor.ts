import { Processor, WorkerHost } from '@nestjs/bullmq'
import type { Job } from 'bullmq'
import { QUEUE } from 'src/infrastructure/queue/queue.constant'
import { NotificationService, NotifyInput } from './notification.service'

@Processor(QUEUE.NOTIFICATION)
export class NotificationProcessor extends WorkerHost {
  constructor(private readonly notificationService: NotificationService) {
    super()
  }

  async process(job: Job): Promise<void> {
    await this.notificationService.notify(job.data as NotifyInput)
  }
}
