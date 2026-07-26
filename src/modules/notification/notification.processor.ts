import { Processor, WorkerHost } from '@nestjs/bullmq'
import type { Job } from 'bullmq'
import { QUEUE } from 'src/infrastructure/queue/queue.constant'
import { QueueProcessorMetricsService } from 'src/infrastructure/queue/queue-processor-metrics.service'
import { NotificationService, NotifyInput } from './notification.service'

@Processor(QUEUE.NOTIFICATION)
export class NotificationProcessor extends WorkerHost {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly processorMetrics: QueueProcessorMetricsService
  ) {
    super()
  }

  async process(job: Job): Promise<void> {
    await this.processorMetrics.run(QUEUE.NOTIFICATION, job, () =>
      this.notificationService.notify(job.data as NotifyInput)
    )
  }
}
