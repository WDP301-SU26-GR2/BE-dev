import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { NotificationType } from '@prisma/client'
import envConfig from 'src/core/config/envConfig'
import { CronMetricsService, runCron } from 'src/core/observability/cron-metrics.service'
import { RedisService } from 'src/infrastructure/redis/redis.service'
import { NotificationQueue } from 'src/modules/notification/notification.queue'
import { TaskMessages } from 'src/modules/task/task.messages'
import { ChapterRepository } from '../chapter.repo'
import { computeWarningLevel, WARNING_LEVEL } from '../chapter.constant'
import { ChapterMessages } from '../chapter.messages'

@Injectable()
export class DeadlineWarningCron {
  private readonly logger = new Logger(DeadlineWarningCron.name)

  constructor(
    private readonly redisService: RedisService,
    private readonly chapterRepository: ChapterRepository,
    private readonly notificationQueue: NotificationQueue,
    private readonly cronMetrics?: CronMetricsService
  ) {}

  // Cron hardening (audit 2026-07-11): outer try/catch (DB blip không thành unhandled rejection)
  // + per-chapter try/catch. NotificationQueue.enqueue tự nuốt lỗi (fallback notifySafe) nên không cần bọc riêng.
  @Cron(CronExpression.EVERY_HOUR)
  async run(): Promise<void> {
    const locked = await this.redisService.setNxEx('cron:deadline-warning', 300)
    if (!locked) return

    try {
      await runCron(this.cronMetrics, 'deadline-warning', async () => {
        const taskThreshold = new Date(Date.now() + envConfig.DEADLINE_WARN_THRESHOLD_HOURS * 3600 * 1000)
        const minLeadMs = envConfig.TASK_WARN_MIN_LEAD_HOURS * 3600 * 1000
        const scanned = await this.chapterRepository.findChaptersForDeadlineScan()
        const tasks = await this.chapterRepository.findTasksNearDeadline(new Date(), taskThreshold, minLeadMs)
        const today = new Date().toISOString().slice(0, 10)
        const now = new Date()

        for (const chapter of scanned) {
          try {
            const level = computeWarningLevel(chapter.publicationType, chapter.deadline, chapter.progressPct, now)
            if (level === WARNING_LEVEL.NONE) continue
            const targets = [chapter.mangakaId, chapter.editorId].filter((id): id is string => Boolean(id))
            for (const recipientId of targets) {
              await this.notificationQueue.enqueue({
                recipientId,
                type: NotificationType.DEADLINE,
                referenceId: chapter.chapterId,
                referenceType: `DEADLINE_WARNING:${level}:${today}`,
                content: ChapterMessages.notification.deadlineWarning(chapter.chapterNumber, chapter.seriesTitle, level)
              })
            }
          } catch (error) {
            this.logger.error(
              `Deadline warning cron: skip chapter ${chapter.chapterId} — ${error instanceof Error ? error.message : String(error)}`
            )
          }
        }

        for (const task of tasks) {
          const targets = [task.assistantId, task.mangakaId].filter((id): id is string => typeof id === 'string')
          const taskLabel = task.taskType == null ? null : (TaskMessages.specializationLabel[task.taskType] ?? null)
          const refType = task.isOverdue ? `TASK_DEADLINE_OVERDUE:${today}` : `TASK_DEADLINE_WARNING:${today}`
          for (const recipientId of targets) {
            await this.notificationQueue.enqueue({
              recipientId,
              type: NotificationType.DEADLINE,
              referenceId: task.taskId,
              referenceType: refType,
              content: ChapterMessages.notification.taskDeadlineWarning(taskLabel, task.pageNumber, task.chapterNumber)
            })
          }
        }

        this.logger.log(`Deadline warning cron: scanned ${scanned.length} chapter(s), ${tasks.length} task(s)`)
      })
    } catch (error) {
      this.logger.error(`Deadline warning cron failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}
