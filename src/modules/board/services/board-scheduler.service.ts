import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { BoardRepository } from '../board.repo'
import { $Enums } from '@prisma/client'
import { RedisService } from 'src/infrastructure/redis/redis.service'
import { BoardSessionStateService } from './board-session-state.service'
import { BoardService } from './board.service'

@Injectable()
export class BoardSchedulerService {
  private readonly logger = new Logger(BoardSchedulerService.name)

  constructor(
    private readonly boardRepo: BoardRepository,
    private readonly boardSessionStateService: BoardSessionStateService,
    private readonly boardService: BoardService,
    private readonly redisService: RedisService
  ) {}

  /**
   * Hệ thống sẽ tự động lao vào hàm này MỖI PHÚT MỘT LẦN (Every Minute).
   * Cron hardening (audit 2026-07-11): Redis lock TTL 55s (< chu kỳ 60s) chống 2 instance cùng quét;
   * state-service vốn đã chặn double-transition (409) nhưng lock tránh quét DB thừa + log rác.
   * Outer try/catch: repo scan lỗi (Mongo blip) không thành unhandled rejection.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async handleAutoStartSessions() {
    const locked = await this.redisService.setNxEx('cron:board-scheduler', 55)
    if (!locked) return

    try {
      // 1. Tìm các cuộc họp đã đến giờ G
      const expiredSessions = await this.boardRepo.findExpiredUpcomingSessions()

      // 2. Duyệt qua từng cuộc họp để chuyển trạng thái sang ACTIVE (state service enforces UPCOMING→ACTIVE)
      for (const session of expiredSessions) {
        try {
          await this.boardSessionStateService.transition(session.id, $Enums.BoardSessionStatus.ACTIVE, null)
          this.logger.warn(
            `[TỰ ĐỘNG KÍCH HOẠT]: Phiên họp "${session.title}" (ID: ${session.id}) đã chính thức bắt đầu!`
          )
        } catch (e) {
          this.logger.warn(
            `[SKIP] Không thể tự động kích hoạt phiên "${session.title}" (ID: ${session.id}): ${(e as Error).message}`
          )
        }
      }

      const overdueSessions = await this.boardRepo.findExpiredActiveSessions()
      for (const session of overdueSessions) {
        try {
          await this.boardService.concludeSession(session.id, null, null)
          this.logger.warn(
            `[TỰ ĐỘNG KẾT THÚC]: Phiên họp "${session.title}" (ID: ${session.id}) đã quá giờ -> CONCLUDED.`
          )
        } catch (e) {
          this.logger.warn(
            `[SKIP] Không thể tự động kết thúc phiên "${session.title}" (ID: ${session.id}): ${(e as Error).message}`
          )
        }
      }
    } catch (error) {
      this.logger.error(`Board scheduler cron failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}
