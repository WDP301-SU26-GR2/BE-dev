import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { BoardRepository } from '../board.repo'
import { $Enums } from '@prisma/client'

@Injectable()
export class BoardSchedulerService {
  private readonly logger = new Logger(BoardSchedulerService.name)

  constructor(private readonly boardRepo: BoardRepository) {}

  /**
   * Hệ thống sẽ tự động lao vào hàm này MỖI PHÚT MỘT LẦN (Every Minute)
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async handleAutoStartSessions() {
    this.logger.log('--- Đang quét các phiên họp cần kích hoạt tự động... ---')

    // 1. Tìm các cuộc họp đã đến giờ G
    const expiredSessions = await this.boardRepo.findExpiredUpcomingSessions()

    if (expiredSessions.length === 0) return

    // 2. Duyệt qua từng cuộc họp để chuyển trạng thái sang ACTIVE
    for (const session of expiredSessions) {
      await this.boardRepo.updateSessionStatusByAuto(session.id, $Enums.BoardSessionStatus.ACTIVE)
      this.logger.warn(`[TỰ ĐỘNG KÍCH HOẠT]: Phiên họp "${session.title}" (ID: ${session.id}) đã chính thức bắt đầu!`)
    }
  }
}
