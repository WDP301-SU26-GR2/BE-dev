import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { NotificationType } from '@prisma/client'
import envConfig from 'src/core/config/envConfig'
import { RedisService } from 'src/infrastructure/redis/redis.service'
import { NotificationQueue } from 'src/modules/notification/notification.queue'
import { ChapterRepository } from '../chapter.repo'
import { ChapterMessages } from '../chapter.messages'

@Injectable()
export class DeadlineWarningCron {
  private readonly logger = new Logger(DeadlineWarningCron.name)

  constructor(
    private readonly redisService: RedisService,
    private readonly chapterRepository: ChapterRepository,
    private readonly notificationQueue: NotificationQueue
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async run(): Promise<void> {
    const locked = await this.redisService.setNxEx('cron:deadline-warning', 300)
    if (!locked) return

    const threshold = new Date(Date.now() + envConfig.DEADLINE_WARN_THRESHOLD_HOURS * 3600 * 1000)
    const chapters = await this.chapterRepository.findChaptersNearDeadline(threshold)
    const now = new Date()
    const tasks = await this.chapterRepository.findTasksNearDeadline(now, threshold)
    const today = new Date().toISOString().slice(0, 10)

    for (const chapter of chapters) {
      const recipients = await this.chapterRepository.findSeriesRecipients(chapter.seriesId)
      if (!recipients) continue
      const targets = [recipients.mangakaId, recipients.editorId].filter((id): id is string => typeof id === 'string')
      for (const recipientId of targets) {
        await this.notificationQueue.enqueue({
          recipientId,
          type: NotificationType.DEADLINE,
          referenceId: chapter.chapterId,
          referenceType: `DEADLINE_WARNING:${today}`,
          content: ChapterMessages.notification.deadlineWarning(chapter.chapterId)
        })
      }
    }

    for (const task of tasks) {
      const targets = [task.assistantId, task.mangakaId].filter((id): id is string => typeof id === 'string')
      for (const recipientId of targets) {
        await this.notificationQueue.enqueue({
          recipientId,
          type: NotificationType.DEADLINE,
          referenceId: task.taskId,
          referenceType: `TASK_DEADLINE_WARNING:${today}`,
          content: ChapterMessages.notification.taskDeadlineWarning(task.taskId)
        })
      }
    }

    this.logger.log(`Deadline warning cron: scanned ${chapters.length} chapter(s), ${tasks.length} task(s)`)
  }
}
