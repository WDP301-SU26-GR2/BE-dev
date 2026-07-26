import { Injectable } from '@nestjs/common'
import { $Enums } from '@prisma/client'
import { BoardGateway } from '../board.gateway'
import type { TransferDecisionContext } from '../board.types'
import {
  CastVoteBodyDto,
  CreateBoardDecisionBodyDto,
  CreateBoardSessionBodyDto,
  CreateSeriesReportBodyDto,
  UpdateBoardConfigBodyDto
} from '../dto/board.dto'
import { BoardDecisionWorkflowService } from './board-decision-workflow.service'
import { BoardGovernanceService } from './board-governance.service'
import { BoardMeetingService } from './board-meeting.service'
import { BoardQueryService } from './board-query.service'
import { BoardSessionWorkflowService } from './board-session-workflow.service'

export type { TransferDecisionContext } from '../board.types'

@Injectable()
export class BoardService {
  constructor(
    private readonly queryService: BoardQueryService,
    private readonly sessionWorkflow: BoardSessionWorkflowService,
    private readonly decisionWorkflow: BoardDecisionWorkflowService,
    private readonly meetingService: BoardMeetingService,
    private readonly boardGateway: BoardGateway,
    private readonly governanceService: BoardGovernanceService
  ) {}

  createSession(creatorId: string, dto: CreateBoardSessionBodyDto) {
    return this.sessionWorkflow.createSession(creatorId, dto)
  }

  suggestBoardMembers(seriesId: string, size?: number) {
    return this.sessionWorkflow.suggestBoardMembers(seriesId, size)
  }

  getSessions(caller?: { userId: string }, query?: { mine?: boolean; status?: $Enums.BoardSessionStatus }) {
    return this.queryService.getSessions(caller, query)
  }

  getSessionById(sessionId: string) {
    return this.queryService.getSessionById(sessionId)
  }

  startSessionManually(sessionId: string) {
    return this.sessionWorkflow.startSessionManually(sessionId)
  }

  concludeSession(sessionId: string, actorId: string | null, roleName: string | null) {
    return this.sessionWorkflow.concludeSession(sessionId, actorId, roleName)
  }

  async advancePhase(sessionId: string, actorId: string, roleName: string, phase: $Enums.BoardSessionPhase) {
    const { session, broadcast } = await this.meetingService.advancePhase(sessionId, actorId, roleName, phase)
    this.boardGateway.broadcastPhaseChanged(broadcast.sessionId, broadcast.phase)
    return session
  }

  getSessionMessages(sessionId: string, userId: string, roleName: string, page: { limit: number; offset: number }) {
    return this.meetingService.listMessages(userId, roleName, sessionId, page)
  }

  getConfig() {
    return this.queryService.getConfig()
  }

  createDecision(dto: CreateBoardDecisionBodyDto) {
    return this.decisionWorkflow.createDecision(dto)
  }

  getDecisions(query?: { boardSessionId?: string; targetSeriesId?: string }) {
    return this.queryService.getDecisions(query)
  }

  getDecisionDetails(decisionId: string) {
    return this.queryService.getDecisionDetails(decisionId)
  }

  getDecisionVotes(decisionId: string) {
    return this.queryService.getDecisionVotes(decisionId)
  }

  castVote(decisionId: string, voterId: string, dto: CastVoteBodyDto) {
    return this.decisionWorkflow.castVote(decisionId, voterId, dto)
  }

  getReports(query?: { seriesId?: string; boardDecisionId?: string }) {
    return this.queryService.getReports(query)
  }

  getReportById(reportId: string) {
    return this.queryService.getReportById(reportId)
  }

  getTransferDecisionContext(decisionId: string): Promise<TransferDecisionContext | null> {
    return this.queryService.getTransferDecisionContext(decisionId)
  }

  findTerminalTransferDecisionContextsBySession(
    boardSessionId: string,
    targetSeriesId: string
  ): Promise<TransferDecisionContext[]> {
    return this.queryService.findTerminalTransferDecisionContextsBySession(boardSessionId, targetSeriesId)
  }

  createSeriesReport(userId: string, dto: CreateSeriesReportBodyDto) {
    return this.governanceService.createSeriesReport(userId, dto)
  }

  updateConfig(id: string, userId: string, dto: UpdateBoardConfigBodyDto) {
    return this.governanceService.updateConfig(id, userId, dto)
  }
}
