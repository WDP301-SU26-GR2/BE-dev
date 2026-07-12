import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { CoOwnerApprovalStatus, NotificationType } from '@prisma/client'
import { RedisService } from 'src/infrastructure/redis/redis.service'
import { NotificationQueue } from 'src/modules/notification/notification.queue'
import { ChapterRepository } from '../chapter.repo'
import { ChapterMessages } from '../chapter.messages'

// A-CHP-06 / B-TRF-05 (BR-TRANSFER-03): co-owner không phản hồi quá deadline → escalate Board.
// Daily; Redis lock chống chạy trùng đa-instance. Chỉ notify Board + editor (auto BoardDecision = defer).
@Injectable()
export class CoOwnerEscalationCron {
  private readonly logger = new Logger(CoOwnerEscalationCron.name)

  constructor(
    private readonly redisService: RedisService,
    private readonly chapterRepository: ChapterRepository,
    private readonly notificationQueue: NotificationQueue
  ) {}

  // Cron hardening (audit 2026-07-11): outer try/catch + per-approval try/catch —
  // 1 approval lỗi (DB blip lúc update/lookup) không giết các escalation còn lại trong tick.
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async run(): Promise<void> {
    const locked = await this.redisService.setNxEx('cron:coowner-escalation', 300)
    if (!locked) return

    try {
      const overdue = await this.chapterRepository.findOverdueCoOwnerApprovals(new Date())
      if (overdue.length === 0) return

      const boardIds = await this.chapterRepository.findBoardMemberIds()

      for (const approval of overdue) {
        try {
          await this.chapterRepository.updateCoOwnerApproval(approval.id, {
            status: CoOwnerApprovalStatus.ESCALATED,
            escalatedAt: new Date()
          })
          const chapter = await this.chapterRepository.findChapterById(approval.chapterId)
          const recipients = new Set<string>(boardIds)
          if (chapter) {
            const series = await this.chapterRepository.findSeriesById(chapter.seriesId)
            if (series?.editorId) recipients.add(series.editorId)
          }
          for (const recipientId of recipients) {
            await this.notificationQueue.enqueue({
              recipientId,
              type: NotificationType.BOARD,
              referenceId: approval.chapterId,
              referenceType: 'COOWNER_APPROVAL_ESCALATED',
              content: ChapterMessages.notification.coOwnerApprovalEscalated
            })
          }
        } catch (error) {
          this.logger.error(
            `Co-owner escalation cron: skip approval ${approval.id} — ${error instanceof Error ? error.message : String(error)}`
          )
        }
      }

      this.logger.log(`Co-owner escalation cron: escalated ${overdue.length} overdue approval(s)`)
    } catch (error) {
      this.logger.error(`Co-owner escalation cron failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}
