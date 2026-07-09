import { Injectable } from '@nestjs/common'
import { $Enums, AuditEntityType } from '@prisma/client'
import { AuditService } from 'src/modules/audit/audit.service'
import { BoardRepository } from '../board.repo'
import { InvalidBoardSessionTransitionException, SessionNotFoundException } from '../errors/board.errors'

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/
export const BOARD_SESSION_TRANSITIONS: Record<string, $Enums.BoardSessionStatus[]> = {
  UPCOMING: [$Enums.BoardSessionStatus.ACTIVE],
  ACTIVE: [$Enums.BoardSessionStatus.CONCLUDED],
  CONCLUDED: []
}

@Injectable()
export class BoardSessionStateService {
  constructor(
    private readonly boardRepo: BoardRepository,
    private readonly auditService: AuditService
  ) {}

  async transition(sessionId: string, to: $Enums.BoardSessionStatus, actorId: string | null) {
    if (!OBJECT_ID_RE.test(sessionId)) throw SessionNotFoundException
    const session = await this.boardRepo.findSessionById(sessionId)
    if (!session) throw SessionNotFoundException
    const from = session.status
    if (!(BOARD_SESSION_TRANSITIONS[from] ?? []).includes(to)) {
      throw InvalidBoardSessionTransitionException
    }
    const updated = await this.boardRepo.updateSessionStatus(sessionId, to)
    await this.auditService.record({
      actorId,
      entityType: AuditEntityType.BOARD_DECISION,
      entityId: sessionId,
      action: 'SESSION_TRANSITION',
      fromState: from,
      toState: to
    })
    return updated
  }
}
