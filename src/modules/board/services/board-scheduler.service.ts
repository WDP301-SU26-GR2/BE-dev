import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { BoardRepository } from '../board.repo'
import { $Enums } from '@prisma/client'
import { BoardSessionStateService } from './board-session-state.service'
import { BoardService } from './board.service'

@Injectable()
export class BoardSchedulerService {
  private readonly logger = new Logger(BoardSchedulerService.name)

  constructor(
    private readonly boardRepo: BoardRepository,
    private readonly boardSessionStateService: BoardSessionStateService,
    private readonly boardService: BoardService
  ) {}

  /**
   * Hệ thống sẽ tự động lao vào hàm này MỖI PHÚT MỘT LẦN (Every Minute)
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async handleAutoStartSessions() {
    this.logger.log('--- Đang quét các phiên họp cần kích hoạt tự động... ---')

    // 1. Tìm các cuộc họp đã đến giờ G
    const expiredSessions = await this.boardRepo.findExpiredUpcomingSessions()

    // 2. Duyệt qua từng cuộc họp để chuyển trạng thái sang ACTIVE (state service enforces UPCOMING→ACTIVE)
    for (const session of expiredSessions) {
      try {
        await this.boardSessionStateService.transition(session.id, $Enums.BoardSessionStatus.ACTIVE, null)
        this.logger.warn(`[TỰ ĐỘNG KÍCH HOẠT]: Phiên họp "${session.title}" (ID: ${session.id}) đã chính thức bắt đầu!`)
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
  }
}
