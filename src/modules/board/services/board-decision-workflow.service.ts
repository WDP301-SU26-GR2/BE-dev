import { Injectable, Logger } from '@nestjs/common'
import { $Enums, AuditEntityType, NotificationType, type Vote } from '@prisma/client'
import { DomainEventBus } from 'src/core/events/domain-event-bus.service'
import { DomainEvent, DomainEventPayload } from 'src/core/events/domain-events'
import { isObjectId } from 'src/core/http/schemas/object-id.schema'
import { AuditService } from 'src/modules/audit/audit.service'
import { NotificationService } from 'src/modules/notification/notification.service'
import { BoardGateway } from '../board.gateway'
import { BoardMessages } from '../board.messages'
import { BoardRepository } from '../board.repo'
import { BoardDecisionResDto, CastVoteBodyDto, CreateBoardDecisionBodyDto } from '../dto/board.dto'
import * as Errors from '../errors/board.errors'

@Injectable()
export class BoardDecisionWorkflowService {
  private readonly logger = new Logger(BoardDecisionWorkflowService.name)

  constructor(
    private readonly boardRepo: BoardRepository,
    private readonly boardGateway: BoardGateway,
    private readonly notificationService: NotificationService,
    private readonly eventBus: DomainEventBus,
    private readonly auditService: AuditService
  ) {}

  async createDecision(dto: CreateBoardDecisionBodyDto) {
    const session = await this.boardRepo.findSessionById(dto.boardSessionId)
    if (!session) throw Errors.SessionNotFoundException
    if (session.allowedEditorIds.length % 2 === 0) throw Errors.InvalidBoardMembersException

    const decision = await this.boardRepo.createDecision(dto)
    const recipients = Array.from(new Set([session.creatorId, ...session.allowedEditorIds]))
    await Promise.all(
      recipients.map((recipientId) =>
        this.notificationService.notifySafe({
          recipientId,
          type: NotificationType.BOARD,
          referenceId: decision.id,
          referenceType: 'BOARD_DECISION_CREATED',
          content: BoardMessages.notification.decisionCreated
        })
      )
    )
    return decision as unknown as BoardDecisionResDto
  }

  async castVote(decisionId: string, voterId: string, dto: CastVoteBodyDto) {
    if (!isObjectId(decisionId)) throw Errors.DecisionNotFoundException
    const decision = await this.boardRepo.findDecisionById(decisionId)
    if (!decision) throw Errors.DecisionNotFoundException
    const session = await this.boardRepo.findSessionById(decision.boardSessionId)
    if (!session) throw Errors.SessionNotFoundException
    if (session.status !== $Enums.BoardSessionStatus.ACTIVE) throw Errors.SessionNotOpenException
    if (!session.allowedEditorIds.includes(voterId)) throw Errors.VoterNotAllowedException
    if (session.phase !== $Enums.BoardSessionPhase.VOTING) throw Errors.VotingNotOpenException
    if (
      decision.result === $Enums.BoardDecisionResult.APPROVED ||
      decision.result === $Enums.BoardDecisionResult.REJECTED ||
      decision.result === $Enums.BoardDecisionResult.EXPIRED
    ) {
      throw Errors.DecisionAlreadyFinalizedException
    }
    if (decision.votes.some((vote) => vote.voterId === voterId)) throw Errors.VoterAlreadyVotedException

    // O-1: kiểm `votes.some(...)` ở trên chỉ để trả lỗi sớm cho trường hợp thường; hàng rào THẬT là
    // lệnh ghi có điều kiện dưới đây — hai request của cùng một thành viên về đồng thời thì chỉ một
    // cái khớp document, cái còn lại nhận `null`.
    const updatedDecision = await this.boardRepo.pushVoteIfNotVoted(decisionId, {
      voterId,
      voteValue: dto.voteValue,
      note: dto.note ?? null,
      votedAt: new Date()
    })
    if (!updatedDecision) throw Errors.VoterAlreadyVotedException
    const finalDecision = await this.recalculateDecisionResult(
      decisionId,
      updatedDecision.votes,
      session.allowedEditorIds.length
    )
    this.boardGateway.broadcastVoteProgress(decision.boardSessionId, {
      decisionId: finalDecision.id,
      approveCount: finalDecision.approveCount,
      rejectCount: finalDecision.rejectCount,
      totalVotes: finalDecision.totalVotes,
      quorumMet: finalDecision.quorumMet,
      result: finalDecision.result
    })
    return { message: BoardMessages.response.voteCast }
  }

  private async recalculateDecisionResult(decisionId: string, votes: Vote[], rosterSize: number) {
    const config = await this.boardRepo.getActiveConfig()
    const majorityRatio = config?.approveMajorityRatio ?? 0.5
    const before = await this.boardRepo.findDecisionById(decisionId)
    if (before?.result === $Enums.BoardDecisionResult.EXPIRED) return before
    const wasTerminal =
      before?.result === $Enums.BoardDecisionResult.APPROVED || before?.result === $Enums.BoardDecisionResult.REJECTED

    const approveCount = votes.filter((vote) => vote.voteValue === $Enums.VoteValue.APPROVE).length
    const rejectCount = votes.filter((vote) => vote.voteValue === $Enums.VoteValue.REJECT).length
    const totalVotes = votes.length
    const quorumMet = totalVotes >= Math.ceil((rosterSize * 2) / 3)
    const winThreshold = rosterSize * majorityRatio
    let result: 'PENDING' | 'APPROVED' | 'REJECTED' | 'PENDING_QUORUM' = 'PENDING'
    if (!quorumMet) result = 'PENDING_QUORUM'
    else if (approveCount > winThreshold) result = 'APPROVED'
    else if (rejectCount >= rosterSize - winThreshold || totalVotes >= rosterSize) result = 'REJECTED'

    const terminalResult = result === 'APPROVED' || result === 'REJECTED' ? result : null
    const counters = {
      quorumMet,
      totalVotes,
      approveCount,
      rejectCount,
      result,
      decidedAt: terminalResult ? new Date() : null
    }

    if (!terminalResult || wasTerminal) return this.boardRepo.updateDecisionCounters(decisionId, counters)

    // O-2: giành quyền chốt bằng lệnh ghi CÓ ĐIỀU KIỆN. Hai phiếu cuối về đồng thời thì cả hai đều
    // thấy `before` chưa terminal, nhưng chỉ một request đổi được document ⇒ chỉ bên thắng mới phát
    // `BoardDecisionFinalized` (nếu không, listener series chạy hai lượt cho cùng một quyết định).
    const claimed = await this.boardRepo.finalizeDecisionCountersIfNotTerminal(decisionId, counters)
    if (claimed > 0 && before) {
      this.emitFinalized(before, terminalResult)
      await this.auditFinalized(before, terminalResult)
    }
    const current = (await this.boardRepo.findDecisionById(decisionId)) ?? before
    if (!current) throw Errors.DecisionNotFoundException
    return current
  }

  private emitFinalized(
    decision: NonNullable<Awaited<ReturnType<BoardRepository['findDecisionById']>>>,
    result: 'APPROVED' | 'REJECTED'
  ) {
    try {
      const payload: DomainEventPayload[typeof DomainEvent.BoardDecisionFinalized] = {
        decisionId: decision.id,
        decisionType:
          (decision.decisionType as DomainEventPayload[typeof DomainEvent.BoardDecisionFinalized]['decisionType']) ??
          '',
        targetSeriesId: decision.targetSeriesId ?? null,
        result,
        details: (decision.details as Record<string, unknown> | null) ?? null
      }
      this.eventBus.emit(DomainEvent.BoardDecisionFinalized, payload)
    } catch (error) {
      this.logger.warn(`Failed to emit BoardDecisionFinalized for ${decision.id}: ${(error as Error).message}`)
    }
  }

  private async auditFinalized(
    decision: NonNullable<Awaited<ReturnType<BoardRepository['findDecisionById']>>>,
    result: 'APPROVED' | 'REJECTED'
  ) {
    try {
      await this.auditService.record({
        actorId: null,
        entityType: AuditEntityType.BOARD_DECISION,
        entityId: decision.id,
        action: 'DECISION_FINALIZED',
        fromState: decision.result ?? 'PENDING',
        toState: result
      })
    } catch (error) {
      this.logger.warn(`Failed to audit DECISION_FINALIZED for ${decision.id}: ${(error as Error).message}`)
    }
  }
}
