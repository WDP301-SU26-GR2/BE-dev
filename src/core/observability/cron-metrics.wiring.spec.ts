import 'reflect-metadata'
import { OtpCleanupCron } from 'src/modules/auth/otp-cleanup.cron'
import { BoardSchedulerService } from 'src/modules/board/services/board-scheduler.service'
import { CoOwnerEscalationCron } from 'src/modules/chapter/services/coowner-escalation.cron'
import { DeadlineWarningCron } from 'src/modules/chapter/services/deadline-warning.cron'
import { PaymentScheduleTriggerService } from 'src/modules/payment/services/payment-schedule-trigger.service'
import { HiatusTooLongCron } from 'src/modules/series/services/hiatus-too-long.cron'
import { OrphanAssetCron } from 'src/modules/storage/orphan-asset.cron'
import { TransferOutboxProcessor } from 'src/modules/transfer/services/transfer-outbox.processor'
import { CronMetricsService } from './cron-metrics.service'

describe('cron metrics dependency wiring', () => {
  it.each([
    ['otp cleanup', OtpCleanupCron],
    ['board scheduler', BoardSchedulerService],
    ['co-owner escalation', CoOwnerEscalationCron],
    ['deadline warning', DeadlineWarningCron],
    ['payment time-bound', PaymentScheduleTriggerService],
    ['hiatus too long', HiatusTooLongCron],
    ['orphan asset', OrphanAssetCron],
    ['transfer outbox', TransferOutboxProcessor]
  ])('%s scheduler declares CronMetricsService as its final dependency', (_name, scheduler) => {
    const dependencies = Reflect.getMetadata('design:paramtypes', scheduler) as unknown[]

    expect(dependencies.at(-1)).toBe(CronMetricsService)
  })
})
