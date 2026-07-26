import { Injectable } from '@nestjs/common'
import {
  AdvancePhaseBodyDto,
  CastVoteBodyDto,
  CreateBoardDecisionBodyDto,
  CreateBoardSessionBodyDto,
  CreateSeriesReportBodyDto,
  ListBoardDecisionsQueryDto,
  ListBoardReportsQueryDto,
  ListBoardSessionsQueryDto,
  UpdateBoardConfigBodyDto
} from '../dto/board.dto'
import { BoardQueryService } from './board-query.service'
import { BoardService } from './board.service'

@Injectable()
export class BoardFacade {
  constructor(
    private readonly queryService: BoardQueryService,
    private readonly workflowService: BoardService
  ) {}

  createSession(creatorId: string, dto: CreateBoardSessionBodyDto) {
    return this.workflowService.createSession(creatorId, dto)
  }

  suggestBoardMembers(seriesId: string, size?: number) {
    return this.workflowService.suggestBoardMembers(seriesId, size)
  }

  getSessions(caller: { userId: string }, query: ListBoardSessionsQueryDto) {
    return this.queryService.getSessions(caller, query)
  }

  getSessionById(id: string) {
    return this.queryService.getSessionById(id)
  }

  startSessionManually(id: string) {
    return this.workflowService.startSessionManually(id)
  }

  concludeSession(id: string, actorId: string | null, roleName: string | null) {
    return this.workflowService.concludeSession(id, actorId, roleName)
  }

  advancePhase(id: string, actorId: string, roleName: string, phase: AdvancePhaseBodyDto['phase']) {
    return this.workflowService.advancePhase(id, actorId, roleName, phase)
  }

  getSessionMessages(id: string, userId: string, roleName: string, page: { limit: number; offset: number }) {
    return this.workflowService.getSessionMessages(id, userId, roleName, page)
  }

  getConfig() {
    return this.queryService.getConfig()
  }

  createDecision(dto: CreateBoardDecisionBodyDto) {
    return this.workflowService.createDecision(dto)
  }

  getDecisions(query: ListBoardDecisionsQueryDto) {
    return this.queryService.getDecisions(query)
  }

  getDecisionDetails(id: string) {
    return this.queryService.getDecisionDetails(id)
  }

  getDecisionVotes(id: string) {
    return this.queryService.getDecisionVotes(id)
  }

  castVote(id: string, voterId: string, dto: CastVoteBodyDto) {
    return this.workflowService.castVote(id, voterId, dto)
  }

  getReports(query: ListBoardReportsQueryDto) {
    return this.queryService.getReports(query)
  }

  getReportById(id: string) {
    return this.queryService.getReportById(id)
  }

  createSeriesReport(userId: string, dto: CreateSeriesReportBodyDto) {
    return this.workflowService.createSeriesReport(userId, dto)
  }

  updateConfig(id: string, userId: string, dto: UpdateBoardConfigBodyDto) {
    return this.workflowService.updateConfig(id, userId, dto)
  }
}
