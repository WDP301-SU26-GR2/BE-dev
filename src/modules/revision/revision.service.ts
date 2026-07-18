import { Injectable, Logger } from '@nestjs/common'
import { NotificationType, RevisionTargetType } from '@prisma/client'
import { RoleName } from 'src/core/security/constants/role.constant'
import { NotificationService } from 'src/modules/notification/notification.service'
import { NotRevisionRecipientException, RevisionRequestNotFoundException } from './errors/revision.errors'
import { toRevisionRequestRes } from './revision.mapper'
import { RevisionMessages } from './revision.messages'
import { RevisionListWhere, RevisionRepository } from './revision.repo'
import { ListRevisionRequestsQueryType } from './schemas/revision-schemas'

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/

export type RevisionCaller = { userId: string; roleName: string }

export interface OpenRevisionInput {
  targetType: RevisionTargetType
  targetId: string
  seriesId?: string | null
  reason: string
  requestedBy: string
  recipientId: string
}

/**
 * Spec 14 §1 — revision rounds.
 *
 * `openSafe` and `currentRound` run after the owning state machine has committed.
 * They are therefore best-effort and must never turn a successful domain transition into a 500 response.
 */
@Injectable()
export class RevisionService {
  private readonly logger = new Logger(RevisionService.name)

  constructor(
    private readonly revisionRepository: RevisionRepository,
    private readonly notificationService: NotificationService
  ) {}

  async openSafe(input: OpenRevisionInput): Promise<{ round: number }> {
    const round = (await this.currentRound(input.targetType, input.targetId)) + 1

    try {
      await this.revisionRepository.create({
        targetType: input.targetType,
        targetId: input.targetId,
        seriesId: input.seriesId ?? null,
        round,
        reason: input.reason,
        requestedBy: input.requestedBy,
        recipientId: input.recipientId
      })
    } catch (error) {
      this.logger.error(`open revision failed (${input.targetType}/${input.targetId} round ${round}): ${String(error)}`)
    }

    return { round }
  }

  /** Số vòng yêu cầu sửa còn mở (chưa resolve) mà user là người phải sửa — dùng cho dashboard badge. */
  countOpenForRecipient(userId: string): Promise<number> {
    return this.revisionRepository.countOpenForRecipient(userId)
  }

  async currentRound(targetType: RevisionTargetType, targetId: string): Promise<number> {
    try {
      return await this.revisionRepository.countByTarget(targetType, targetId)
    } catch (error) {
      this.logger.error(`count revision rounds failed (${targetType}/${targetId}): ${String(error)}`)
      return 0
    }
  }

  async resolve(userId: string, id: string) {
    if (!OBJECT_ID_RE.test(id)) throw RevisionRequestNotFoundException

    const row = await this.revisionRepository.findById(id)
    if (!row) throw RevisionRequestNotFoundException
    if (row.recipientId !== userId) throw NotRevisionRecipientException
    if (row.isResolved) return toRevisionRequestRes(row)

    // Compare-and-set makes concurrent resolve calls idempotent: exactly one caller
    // changes the row and owns the notification side-effect.
    const claim = await this.revisionRepository.markResolvedIfOpen(id, userId)
    const updated = await this.revisionRepository.findById(id)

    if (!updated) throw RevisionRequestNotFoundException
    if (updated.recipientId !== userId) throw NotRevisionRecipientException

    if (claim.count === 0) return toRevisionRequestRes(updated)

    await this.notificationService.notifySafe({
      recipientId: row.requestedBy,
      type: NotificationType.REVIEW,
      referenceId: id,
      referenceType: 'REVISION_RESOLVED',
      content: RevisionMessages.notification.revisionResolved(row.round)
    })

    return toRevisionRequestRes(updated)
  }

  async list(caller: RevisionCaller, query: ListRevisionRequestsQueryType) {
    const page = { limit: query.limit, offset: query.offset }

    // Guard malformed ObjectIds before Prisma can raise P2023 and turn this read route into a 500.
    if (query.targetId !== undefined && !OBJECT_ID_RE.test(query.targetId)) {
      return { items: [], total: 0, limit: query.limit, offset: query.offset }
    }

    const privileged = caller.roleName === RoleName.SUPER_ADMIN || caller.roleName === RoleName.BOARD_MEMBER
    const where: RevisionListWhere = {
      ...(query.targetType ? { targetType: query.targetType } : {}),
      ...(query.targetId !== undefined ? { targetId: query.targetId } : {}),
      ...(query.isResolved !== undefined ? { isResolved: query.isResolved } : {}),
      ...(privileged ? {} : { OR: [{ recipientId: caller.userId }, { requestedBy: caller.userId }] })
    }

    const [rows, total] = await Promise.all([
      this.revisionRepository.findMany(where, page),
      this.revisionRepository.count(where)
    ])

    return {
      items: rows.map(toRevisionRequestRes),
      total,
      limit: query.limit,
      offset: query.offset
    }
  }
}
