import { Module } from '@nestjs/common'
import { BoardController } from './board.controller'
import { BoardService } from './services/board.service'
import { BoardRepository } from './board.repo'
import { BoardGateway } from './board.gateway'
import { NotificationModule } from '../notification/notification.module'

@Module({
  imports: [NotificationModule],
  controllers: [BoardController],
  providers: [BoardService, BoardRepository, BoardGateway, ],
  exports: [BoardService] // Xuất BoardService ra ngoài nếu các module khác (như Contract) cần inject để dùng chung
})
export class BoardModule {}
