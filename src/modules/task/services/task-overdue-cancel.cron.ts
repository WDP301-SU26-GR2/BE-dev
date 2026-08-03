import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { NotificationType, TaskStatus } from '@prisma/client'
import { CronMetricsService, runCron } from 'src/core/observability/cron-metrics.service'
import { RedisService } from 'src/infrastructure/redis/redis.service'
import { AppConfigService } from 'src/modules/app-config/app-config.service'
import { NotificationQueue } from 'src/modules/notification/notification.queue'
import { TaskMessages } from '../task.messages'
import { TaskRepository } from '../task.repo'
import { TaskStateService } from './task-state.service'

// Spec 31 Phần A: công việc quá hạn quá thời gian ân hạn thì tự huỷ, thay vì nằm rác vĩnh viễn.
// Huỷ là thao tác KHÔNG đảo ngược được (CANCELLED là terminal) nên phải qua ân hạn, và chỉ áp cho
// công việc còn nằm ở phía trợ lý mà chưa nộp gì.
@Injectable()
export class TaskOverdueCancelCron {
  private readonly logger = new Logger(TaskOverdueCancelCron.name)

  constructor(
    private readonly redisService: RedisService,
    private readonly taskRepository: TaskRepository,
    private readonly taskStateService: TaskStateService,
    private readonly appConfigService: AppConfigService,
    private readonly notificationQueue: NotificationQueue,
    private readonly cronMetrics?: CronMetricsService
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async run(): Promise<void> {
    const locked = await this.redisService.setNxEx('cron:task-overdue-cancel', 300)
    if (!locked) return

    try {
      await runCron(this.cronMetrics, 'task-overdue-cancel', async () => {
        const config = await this.appConfigService.get()
        const cutoff = new Date(Date.now() - config.taskOverdueGraceHours * 3_600_000)
        const overdue = await this.taskRepository.findOverdueForCancel(cutoff)
        if (overdue.length === 0) return

        let cancelled = 0
        for (const item of overdue) {
          try {
            // Single-writer (AGENTS §9). transition() TỰ ghi audit — KHÔNG gọi AuditService lần nữa.
            await this.taskStateService.transition(
              item.taskId,
              TaskStatus.CANCELLED,
              TaskMessages.reason.autoCancelledOverdue,
              null
            )
            cancelled += 1
            const content = TaskMessages.notification.autoCancelledOverdue(item.pageNumber, item.chapterNumber)
            const recipients = [item.assistantId, item.mangakaId].filter((id): id is string => Boolean(id))
            for (const recipientId of recipients) {
              await this.notificationQueue.enqueue({
                recipientId,
                type: NotificationType.TASK,
                referenceId: item.taskId,
                referenceType: 'TASK_AUTO_CANCELLED',
                content
              })
            }
          } catch (error) {
            this.logger.error(
              `Task overdue cancel: bỏ qua ${item.taskId} — ${error instanceof Error ? error.message : String(error)}`
            )
          }
        }
        this.logger.log(`Task overdue cancel: quét ${overdue.length}, đã huỷ ${cancelled}`)
      })
    } catch (error) {
      this.logger.error(`Task overdue cancel cron failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}
