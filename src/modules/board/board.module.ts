import { Module } from '@nestjs/common'
import { BoardController } from './board.controller'
import { BoardService } from './services/board.service'
import { BoardRepository } from './board.repo'
import { BoardGateway } from './board.gateway'
import { NotificationModule } from '../notification/notification.module'
import { BoardSessionStateService } from './services/board-session-state.service'
import { BoardSchedulerService } from './services/board-scheduler.service'
import { BoardRosterService } from './services/board-roster.service'
import { BoardMeetingService } from './services/board-meeting.service'
import { BoardFacade } from './services/board.facade'
import { BoardQueryService } from './services/board-query.service'
import { BoardSessionWorkflowService } from './services/board-session-workflow.service'
import { BoardDecisionWorkflowService } from './services/board-decision-workflow.service'
import { BoardGovernanceService } from './services/board-governance.service'

@Module({
  imports: [NotificationModule],
  controllers: [BoardController],
  providers: [
    BoardService,
    BoardFacade,
    BoardQueryService,
    BoardSessionWorkflowService,
    BoardDecisionWorkflowService,
    BoardGovernanceService,
    BoardRepository,
    BoardGateway,
    BoardSessionStateService,
    BoardSchedulerService,
    BoardRosterService,
    BoardMeetingService
  ],
  exports: [BoardService] // Xuất BoardService ra ngoài nếu các module khác (như Contract) cần inject để dùng chung
})
export class BoardModule {}
