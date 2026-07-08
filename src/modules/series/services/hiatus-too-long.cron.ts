import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { NotificationType } from '@prisma/client'
import { RedisService } from 'src/infrastructure/redis/redis.service'
import { AppConfigService } from 'src/modules/app-config/app-config.service'
import { NotificationQueue } from 'src/modules/notification/notification.queue'
import { SeriesRepository } from '../series.repo'
import { SeriesMessages } from '../series.messages'

// PB-06: Series has been in HIATUS longer than AppConfig.hiatusTooLongDays days.
// Daily cron; flags for Board triage. Recipients = Board (all members) + series.editorId (if any).
// Redis lock chống chạy trùng đa-instance (mirrors CoOwnerEscalationCron pattern).
@Injectable()
export class HiatusTooLongCron {
  private readonly logger = new Logger(HiatusTooLongCron.name)

  constructor(
    private readonly redisService: RedisService,
    private readonly seriesRepository: SeriesRepository,
    private readonly appConfigService: AppConfigService,
    private readonly notificationQueue: NotificationQueue
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async run(): Promise<void> {
    const locked = await this.redisService.setNxEx('cron:hiatus-too-long', 300)
    if (!locked) return

    const config = await this.appConfigService.get()
    const cutoff = new Date(Date.now() - config.hiatusTooLongDays * 86_400_000)
    const overdue = await this.seriesRepository.findHiatusStartedBefore(cutoff)
    if (overdue.length === 0) return

    const boardIds = await this.seriesRepository.findBoardMemberIds()
    // Append the day to the referenceType so the same (recipient, series) pair can be re-notified
    // the next day without being deduped by NotificationService.findDuplicate (which keys on
    // recipient+type+referenceId+referenceType).
    const day = new Date().toISOString().slice(0, 10)

    for (const series of overdue) {
      const recipients = new Set<string>(boardIds)
      if (series.editorId) recipients.add(series.editorId)
      for (const recipientId of recipients) {
        await this.notificationQueue.enqueue({
          recipientId,
          type: NotificationType.SYSTEM,
          referenceId: series.id,
          referenceType: `SERIES_HIATUS_TOO_LONG:${day}`,
          content: SeriesMessages.notification.hiatusTooLong
        })
      }
    }

    this.logger.log(`Hiatus-too-long cron: flagged ${overdue.length} series`)
  }
}
