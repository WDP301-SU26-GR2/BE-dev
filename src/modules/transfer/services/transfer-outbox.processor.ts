import { Injectable, Logger } from '@nestjs/common'
import { Interval } from '@nestjs/schedule'
import { AuditEntityType, OutboxEventType } from '@prisma/client'
import { CronMetricsService, runCron } from 'src/core/observability/cron-metrics.service'
import { OutboxRepo } from 'src/infrastructure/database/outbox.repo'
import { AuditService } from 'src/modules/audit/audit.service'
import { MAX_TRANSFER_SETTLEMENT_ATTEMPTS } from '../transfer.constant'
import { TransferFinalizerService } from './transfer-finalizer.service'

@Injectable()
export class TransferOutboxProcessor {
  private readonly logger = new Logger(TransferOutboxProcessor.name)
  private running = false

  constructor(
    private readonly outbox: OutboxRepo,
    private readonly finalizer: TransferFinalizerService,
    private readonly audit: AuditService,
    private readonly cronMetrics?: CronMetricsService
  ) {}

  @Interval(5000)
  async process(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      await runCron(this.cronMetrics, 'transfer-outbox', async () => {
        // §v2 point 9: chỉ lấy event CHƯA vượt trần thử — event dead-letter không quay lại vòng retry.
        const events = await this.outbox.findPending(
          OutboxEventType.TRANSFER_REPLACEMENT_READY,
          20,
          MAX_TRANSFER_SETTLEMENT_ATTEMPTS
        )
        for (const event of events) {
          try {
            await this.finalizer.finalize(event)
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            await this.outbox.markFailed(event.id, message)
            const attemptsAfter = ((event as { attempts?: number }).attempts ?? 0) + 1
            if (attemptsAfter >= MAX_TRANSFER_SETTLEMENT_ATTEMPTS) {
              // §v2 point 9: dead-letter → cảnh báo vận hành (ERROR) + audit để truy vết, KHÔNG retry nữa.
              this.logger.error(
                `Transfer settlement ${event.id} DEAD-LETTERED after ${attemptsAfter} attempts: ${message}`
              )
              await this.recordDeadLetter(event, message)
            } else {
              this.logger.warn(`Transfer outbox ${event.id} failed (attempt ${attemptsAfter}): ${message}`)
            }
          }
        }
      })
    } finally {
      this.running = false
    }
  }

  private async recordDeadLetter(event: { id: string; payload?: unknown }, message: string): Promise<void> {
    const transferRequestId = (event.payload as { transferRequestId?: string } | undefined)?.transferRequestId
    try {
      await this.audit.record({
        actorId: null,
        entityType: AuditEntityType.TRANSFER_REQUEST,
        entityId: transferRequestId ?? event.id,
        action: 'SETTLEMENT_DEAD_LETTER',
        reason: message.slice(0, 500)
      })
    } catch (auditError) {
      this.logger.warn(
        `Failed to audit dead-letter for ${event.id}: ${auditError instanceof Error ? auditError.message : String(auditError)}`
      )
    }
  }
}
