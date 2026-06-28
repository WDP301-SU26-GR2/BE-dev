import { Module } from '@nestjs/common'
import { BoardController } from './board.controller'
import { BoardService } from './services/board.service'
import { BoardRepository } from './board.repo'
import { BoardGateway } from './board.gateway'

@Module({
  imports: [], // Nếu dự án của bạn không để PrismaModule làm Global, hãy thêm PrismaModule vào đây
  controllers: [BoardController],
  providers: [BoardService, BoardRepository, BoardGateway, ],
  exports: [BoardService] // Xuất BoardService ra ngoài nếu các module khác (như Contract) cần inject để dùng chung
})
export class BoardModule {}
