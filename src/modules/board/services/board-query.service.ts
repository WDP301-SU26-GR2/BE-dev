import { Injectable } from '@nestjs/common'
import { $Enums } from '@prisma/client'
import { isObjectId } from 'src/core/http/schemas/object-id.schema'
import { BoardRepository } from '../board.repo'
import * as Errors from '../errors/board.errors'
import { BoardDecisionResDto, BoardSessionResDto, BoardVoteResDto } from '../dto/board.dto'
import type { ContractDecisionContext, ContractDecisionResourceType, TransferDecisionContext } from '../board.types'

@Injectable()
export class BoardQueryService {
  constructor(private readonly repository: BoardRepository) {}

  async getConfig() {
    const config = await this.repository.getActiveConfig()
    if (!config) throw Errors.BoardConfigNotFoundException
    return config
  }

  async getSessions(caller?: { userId: string }, query?: { mine?: boolean; status?: $Enums.BoardSessionStatus }) {
    const sessions = await this.repository.findManySessions({
      participantId: query?.mine && caller ? caller.userId : undefined,
      status: query?.status
    })
    return (await this.enrichSessions(sessions)) as unknown as BoardSessionResDto[]
  }

  async getSessionById(sessionId: string) {
    if (!isObjectId(sessionId)) throw Errors.SessionNotFoundException
    const session = await this.repository.findSessionById(sessionId)
    if (!session) throw Errors.SessionNotFoundException
    const [enriched] = await this.enrichSessions([session])
    return enriched as unknown as BoardSessionResDto
  }

  async getDecisions(
    query?: { boardSessionId?: string; targetSeriesId?: string; mine?: 'true' | 'false' },
    userId?: string
  ) {
    if (query?.boardSessionId !== undefined && !isObjectId(query.boardSessionId)) return []
    if (query?.targetSeriesId !== undefined && !isObjectId(query.targetSeriesId)) return []
    // §v2 point 10: mine=true → chỉ decision thuộc phiên user nằm trong roster (creator KHÔNG mặc nhiên thuộc).
    let boardSessionIds: string[] | undefined
    if (query?.mine === 'true') {
      if (!userId) return []
      const sessions = await this.repository.findMemberSessionIds(userId)
      if (sessions.length === 0) return []
      boardSessionIds = sessions.map((session) => session.id)
    }
    const decisions = await this.repository.findManyDecisions({
      boardSessionId: query?.boardSessionId,
      targetSeriesId: query?.targetSeriesId,
      boardSessionIds
    })
    return (await this.enrichDecisions(decisions)) as unknown as BoardDecisionResDto[]
  }

  async getDecisionDetails(decisionId: string) {
    if (!isObjectId(decisionId)) throw Errors.DecisionNotFoundException
    const decision = await this.repository.findDecisionById(decisionId)
    if (!decision) throw Errors.DecisionNotFoundException
    const [enriched] = await this.enrichDecisions([decision])
    return enriched as unknown as BoardDecisionResDto
  }

  async getDecisionVotes(decisionId: string) {
    if (!isObjectId(decisionId)) throw Errors.DecisionNotFoundException
    const decision = await this.repository.findDecisionById(decisionId)
    if (!decision) throw Errors.DecisionNotFoundException
    return (decision.votes ?? []) as unknown as BoardVoteResDto[]
  }

  async getReports(query?: { seriesId?: string; boardDecisionId?: string }) {
    if (query?.seriesId !== undefined && !isObjectId(query.seriesId)) return []
    if (query?.boardDecisionId !== undefined && !isObjectId(query.boardDecisionId)) return []
    return this.repository.findManyReports(query)
  }

  async getReportById(reportId: string) {
    if (!isObjectId(reportId)) throw Errors.ReportNotFoundException
    const report = await this.repository.findReportById(reportId)
    if (!report) throw Errors.ReportNotFoundException
    return report
  }

  async getTransferDecisionContext(decisionId: string): Promise<TransferDecisionContext | null> {
    if (!isObjectId(decisionId)) return null
    const decision = await this.repository.findDecisionById(decisionId)
    if (!decision) return null
    const session = await this.repository.findSessionById(decision.boardSessionId)
    if (!session) return null
    return {
      id: decision.id,
      boardSessionId: decision.boardSessionId,
      targetSeriesId: decision.targetSeriesId ?? null,
      transferRequestId: decision.transferRequestId ?? null,
      decisionType: decision.decisionType ?? null,
      result: decision.result ?? null,
      allowedEditorIds: Array.from(new Set([...(decision.allowedEditorIds ?? []), ...(session.allowedEditorIds ?? [])]))
    }
  }

  async getContractDecisionContext(decisionId: string): Promise<ContractDecisionContext | null> {
    if (!isObjectId(decisionId)) return null
    const decision = await this.repository.findDecisionById(decisionId)
    if (!decision) return null
    const session = await this.repository.findSessionById(decision.boardSessionId)
    if (!session) return null
    const details =
      decision.details && typeof decision.details === 'object' && !Array.isArray(decision.details)
        ? (decision.details as Record<string, unknown>)
        : null
    return {
      id: decision.id,
      boardSessionId: decision.boardSessionId,
      targetSeriesId: decision.targetSeriesId ?? null,
      decisionType: decision.decisionType ?? null,
      result: decision.result ?? null,
      details,
      decidedAt: decision.decidedAt ?? null,
      allowedEditorIds: Array.from(new Set([...(decision.allowedEditorIds ?? []), ...(session.allowedEditorIds ?? [])]))
    }
  }

  async findApprovedContractDecisionContext(command: {
    targetSeriesId: string
    resourceType: ContractDecisionResourceType
    resourceId: string
  }): Promise<ContractDecisionContext | null> {
    if (!isObjectId(command.targetSeriesId) || !isObjectId(command.resourceId)) return null
    const decisions = await this.repository.findApprovedContractDecisions(command.targetSeriesId)
    const matching = decisions.find((decision) => {
      if (!decision.details || typeof decision.details !== 'object' || Array.isArray(decision.details)) return false
      const details = decision.details as Record<string, unknown>
      return details.resourceType === command.resourceType && details.resourceId === command.resourceId
    })
    return matching ? this.getContractDecisionContext(matching.id) : null
  }

  async findTerminalTransferDecisionContextsBySession(
    boardSessionId: string,
    targetSeriesId: string
  ): Promise<TransferDecisionContext[]> {
    if (!isObjectId(boardSessionId) || !isObjectId(targetSeriesId)) return []
    const decisions = await this.repository.findManyDecisions({ boardSessionId, targetSeriesId })
    const terminal = decisions.filter(
      (decision) =>
        decision.decisionType === $Enums.DecisionType.TRANSFER &&
        (decision.result === $Enums.BoardDecisionResult.APPROVED ||
          decision.result === $Enums.BoardDecisionResult.REJECTED)
    )
    const contexts = await Promise.all(terminal.map((decision) => this.getTransferDecisionContext(decision.id)))
    return contexts.filter((context): context is TransferDecisionContext => context !== null)
  }

  private toUserMini(user: { id: string; name: string; displayName: string | null; avatar: string | null }) {
    return { id: user.id, displayName: user.displayName ?? user.name, avatar: user.avatar ?? null }
  }

  private async enrichSessions<T extends { creatorId: string; allowedEditorIds: string[] }>(sessions: T[]) {
    const userIds = Array.from(new Set(sessions.flatMap((session) => [session.creatorId, ...session.allowedEditorIds])))
    const users = (await this.repository.findUsersMiniByIds(userIds)) as Array<{
      id: string
      name: string
      displayName: string | null
      avatar: string | null
    }>
    const usersById = new Map(users.map((user) => [user.id, this.toUserMini(user)] as const))
    return sessions.map((session) => ({
      ...session,
      creator: usersById.get(session.creatorId),
      members: session.allowedEditorIds
        .map((memberId) => usersById.get(memberId))
        .filter((member): member is NonNullable<typeof member> => member !== undefined)
    }))
  }

  private async enrichDecisions<T extends { targetSeriesId: string | null }>(decisions: T[]) {
    const seriesIds = Array.from(
      new Set(decisions.map((decision) => decision.targetSeriesId).filter((id): id is string => id !== null))
    )
    const seriesRows = (await this.repository.findSeriesTitlesByIds(seriesIds)) as Array<{ id: string; title: string }>
    const seriesById = new Map(seriesRows.map((series) => [series.id, { id: series.id, title: series.title }] as const))
    return decisions.map((decision) => ({
      ...decision,
      targetSeries: decision.targetSeriesId ? (seriesById.get(decision.targetSeriesId) ?? null) : null
    }))
  }
}
