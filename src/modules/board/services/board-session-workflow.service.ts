import { Injectable } from '@nestjs/common'
import { $Enums, AuditEntityType, NotificationType } from '@prisma/client'
import { isObjectId } from 'src/core/http/schemas/object-id.schema'
import { RoleName } from 'src/core/security/constants/role.constant'
import { AuditService } from 'src/modules/audit/audit.service'
import { NotificationService } from 'src/modules/notification/notification.service'
import { computeRosterCap } from '../board.constant'
import { BoardMessages } from '../board.messages'
import { BoardRepository } from '../board.repo'
import { CreateBoardSessionBodyDto } from '../dto/board.dto'
import * as Errors from '../errors/board.errors'
import { BoardRosterService } from './board-roster.service'
import { BoardSessionStateService } from './board-session-state.service'

@Injectable()
export class BoardSessionWorkflowService {
  constructor(
    private readonly boardRepo: BoardRepository,
    private readonly notificationService: NotificationService,
    private readonly stateService: BoardSessionStateService,
    private readonly rosterService: BoardRosterService,
    private readonly auditService: AuditService
  ) {}

  async createSession(creatorId: string, dto: CreateBoardSessionBodyDto) {
    const isManual = Boolean(dto.allowedEditorIds && dto.allowedEditorIds.length > 0)
    let roster = dto.allowedEditorIds
    if (!isManual) {
      if (!dto.seriesId) throw Errors.RosterSourceRequiredException
      const suggestion = await this.rosterService.suggest(dto.seriesId, dto.rosterSize)
      roster = suggestion.items.map((candidate) => candidate.userId)
    }
    roster = roster ?? []
    if (roster.length === 0 || roster.length % 2 === 0) throw Errors.InvalidBoardMembersException
    // Nhánh manual: enforce trần max CHUNG với nhánh auto (min 3 + lẻ đã kiểm ở schema/dòng trên).
    // Nhánh auto đã bị BoardRosterService cap sẵn nên không cần kiểm lại ở đây.
    if (isManual) {
      const config = await this.boardRepo.getActiveConfig()
      if (roster.length > computeRosterCap(config.boardTotalMembers)) throw Errors.RosterSizeTooLargeException
    }
    if (await this.boardRepo.findActiveSessionByTitle(dto.title)) throw Errors.SessionAlreadyExistsException

    const session = await this.boardRepo.createSession(creatorId, dto, roster)
    const recipients = Array.from(new Set([creatorId, ...roster]))
    await Promise.all(
      recipients.map((recipientId) =>
        this.notificationService.notifySafe({
          recipientId,
          type: NotificationType.BOARD,
          referenceId: session.id,
          referenceType: 'BOARD_SESSION_CREATED',
          content: BoardMessages.notification.sessionCreated(dto.title)
        })
      )
    )
    return session
  }

  suggestBoardMembers(seriesId: string, size?: number) {
    return this.rosterService.suggest(seriesId, size)
  }

  async startSessionManually(sessionId: string) {
    if (!isObjectId(sessionId)) throw Errors.SessionNotFoundException
    return this.stateService.transition(sessionId, $Enums.BoardSessionStatus.ACTIVE, null)
  }

  async concludeSession(sessionId: string, actorId: string | null, roleName: string | null) {
    if (!isObjectId(sessionId)) throw Errors.SessionNotFoundException
    const session = await this.boardRepo.findSessionById(sessionId)
    if (!session) throw Errors.SessionNotFoundException
    if (actorId !== null && roleName !== RoleName.SUPER_ADMIN && session.creatorId !== actorId) {
      throw Errors.NotSessionCreatorException
    }

    const concluded = await this.stateService.transition(sessionId, $Enums.BoardSessionStatus.CONCLUDED, actorId)
    const pendingDecisions = await this.boardRepo.findNonTerminalDecisionsBySession(sessionId)
    for (const decision of pendingDecisions) {
      await this.boardRepo.updateDecisionCounters(decision.id, { result: 'EXPIRED', decidedAt: new Date() })
      await this.auditService.record({
        actorId,
        entityType: AuditEntityType.BOARD_DECISION,
        entityId: decision.id,
        action: 'DECISION_EXPIRED',
        fromState: decision.result ?? 'PENDING',
        toState: 'EXPIRED',
        reason: BoardMessages.reason.concludedWithoutQuorum
      })
    }

    const content =
      pendingDecisions.length > 0
        ? BoardMessages.notification.sessionConcludedWithExpired(pendingDecisions.length)
        : BoardMessages.notification.sessionConcluded
    const recipients = Array.from(new Set([session.creatorId, ...(session.allowedEditorIds ?? [])]))
    await Promise.all(
      recipients.map((recipientId) =>
        this.notificationService.notifySafe({
          recipientId,
          type: NotificationType.BOARD,
          referenceId: sessionId,
          referenceType: 'BOARD_SESSION_CONCLUDED',
          content
        })
      )
    )
    return concluded
  }
}
