import { Injectable, Logger } from '@nestjs/common'
import { Interval } from '@nestjs/schedule'
import { OutboxEventType } from '@prisma/client'
import { CronMetricsService, runCron } from 'src/core/observability/cron-metrics.service'
import { OutboxRepo } from 'src/infrastructure/database/outbox.repo'
import { TransferFinalizerService } from './transfer-finalizer.service'

@Injectable()
export class TransferOutboxProcessor {
  private readonly logger = new Logger(TransferOutboxProcessor.name)
  private running = false

  constructor(
    private readonly outbox: OutboxRepo,
    private readonly finalizer: TransferFinalizerService,
    private readonly cronMetrics?: CronMetricsService
  ) {}

  @Interval(5000)
  async process(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      await runCron(this.cronMetrics, 'transfer-outbox', async () => {
        const events = await this.outbox.findPending(OutboxEventType.TRANSFER_REPLACEMENT_READY)
        for (const event of events) {
          try {
            await this.finalizer.finalize(event)
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            this.logger.warn(`Transfer outbox ${event.id} failed: ${message}`)
            await this.outbox.markFailed(event.id, message)
          }
        }
      })
    } finally {
      this.running = false
    }
  }
}
