import { Injectable } from '@nestjs/common'
import { $Enums, AuditEntityType, BoardMessage } from '@prisma/client'
import { RoleName } from 'src/core/security/constants/role.constant'
import { AuditService } from 'src/modules/audit/audit.service'
import { BoardRepository } from '../board.repo'
import * as Errors from '../errors/board.errors'

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/
const PHASE_ORDER: Record<$Enums.BoardSessionPhase, number> = { PRESENTING: 0, QA: 1, VOTING: 2 }
const MESSAGE_MAX_LENGTH = 1000

export type UserMini = { id: string; displayName: string; avatar: string | null }
export type BoardMessageView = {
  id: string
  sessionId: string
  sender: UserMini
  content: string
  phase: $Enums.BoardSessionPhase
  createdAt: Date
}
export type SendMessageResult =
  | { status: 'SUCCESS'; message: BoardMessageView }
  | { status: 'DENIED'; reason: 'NOT_PARTICIPANT' | 'SESSION_NOT_ACTIVE' | 'VOTING_PHASE' | 'INVALID_INPUT' }

type SessionLike = { creatorId: string; allowedEditorIds: string[] }

/**
 * Spec 16 meeting-room use cases. This service deliberately does not inject BoardGateway;
 * callers own realtime broadcasting after the database operation succeeds.
 */
@Injectable()
export class BoardMeetingService {
  constructor(
    private readonly boardRepo: BoardRepository,
    private readonly auditService: AuditService
  ) {}

  private isParticipant(session: SessionLike, userId: string, roleName?: string | null): boolean {
    return (
      roleName === RoleName.SUPER_ADMIN || session.creatorId === userId || session.allowedEditorIds.includes(userId)
    )
  }

  private async resolveSenders(senderIds: string[]): Promise<Map<string, UserMini>> {
    const rows = await this.boardRepo.findUsersMiniByIds(Array.from(new Set(senderIds)))
    const senders = new Map<string, UserMini>()
    for (const user of rows) {
      senders.set(user.id, {
        id: user.id,
        displayName: user.displayName ?? user.name,
        avatar: user.avatar ?? null
      })
    }
    return senders
  }

  private toView(message: BoardMessage, sender?: UserMini): BoardMessageView {
    return {
      id: message.id,
      sessionId: message.sessionId,
      sender: sender ?? { id: message.senderId, displayName: 'Unknown', avatar: null },
      content: message.content,
      phase: message.phase,
      createdAt: message.createdAt
    }
  }

  async advancePhase(sessionId: string, actorId: string, roleName: string, targetPhase: $Enums.BoardSessionPhase) {
    if (!OBJECT_ID_RE.test(sessionId)) throw Errors.SessionNotFoundException
    const session = await this.boardRepo.findSessionById(sessionId)
    if (!session) throw Errors.SessionNotFoundException
    if (roleName !== RoleName.SUPER_ADMIN && session.creatorId !== actorId) throw Errors.NotSessionCreatorException
    if (session.status !== $Enums.BoardSessionStatus.ACTIVE) throw Errors.SessionNotOpenException
    if (PHASE_ORDER[targetPhase] <= PHASE_ORDER[session.phase]) throw Errors.InvalidPhaseTransitionException

    const updatedSession = await this.boardRepo.updateSessionPhase(sessionId, targetPhase)
    try {
      await this.auditService.record({
        actorId,
        entityType: AuditEntityType.BOARD_SESSION,
        entityId: sessionId,
        action: 'PHASE_ADVANCED',
        fromState: session.phase,
        toState: targetPhase
      })
    } catch {
      // Audit is best-effort and must not roll back a phase already committed to MongoDB.
    }

    return { session: updatedSession, broadcast: { sessionId, phase: targetPhase } }
  }

  async sendMessage(
    userId: string,
    roleName: string | undefined,
    sessionId: string,
    content: string
  ): Promise<SendMessageResult> {
    if (!OBJECT_ID_RE.test(sessionId)) return { status: 'DENIED', reason: 'NOT_PARTICIPANT' }
    const session = await this.boardRepo.findSessionById(sessionId)
    if (!session || !this.isParticipant(session, userId, roleName)) {
      return { status: 'DENIED', reason: 'NOT_PARTICIPANT' }
    }
    if (session.status !== $Enums.BoardSessionStatus.ACTIVE) {
      return { status: 'DENIED', reason: 'SESSION_NOT_ACTIVE' }
    }
    if (session.phase === $Enums.BoardSessionPhase.VOTING) {
      return { status: 'DENIED', reason: 'VOTING_PHASE' }
    }

    const trimmedContent = (content ?? '').trim()
    if (trimmedContent.length === 0 || trimmedContent.length > MESSAGE_MAX_LENGTH) {
      return { status: 'DENIED', reason: 'INVALID_INPUT' }
    }

    const message = await this.boardRepo.createBoardMessage({
      sessionId,
      senderId: userId,
      content: trimmedContent,
      phase: session.phase
    })
    const senders = await this.resolveSenders([userId])
    return { status: 'SUCCESS', message: this.toView(message, senders.get(userId)) }
  }

  async listMessages(
    userId: string,
    roleName: string,
    sessionId: string,
    page: { limit: number; offset: number }
  ): Promise<{ items: BoardMessageView[]; total: number }> {
    if (!OBJECT_ID_RE.test(sessionId)) throw Errors.SessionNotFoundException
    const session = await this.boardRepo.findSessionById(sessionId)
    if (!session) throw Errors.SessionNotFoundException
    if (!this.isParticipant(session, userId, roleName)) throw Errors.NotSessionParticipantException

    const { items, total } = await this.boardRepo.findMessagesBySession(sessionId, page)
    const senders = await this.resolveSenders(items.map((message) => message.senderId))
    return {
      items: items.map((message) => this.toView(message, senders.get(message.senderId))),
      total
    }
  }
}
