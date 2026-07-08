import { Injectable } from '@nestjs/common'
import { DeadlineRequestStatus, NotificationType } from '@prisma/client'
import envConfig from 'src/core/config/envConfig'
import { ScheduleService } from 'src/modules/chapter/services/schedule.service'
import { NotificationService } from 'src/modules/notification/notification.service'
import { computeAffectsSlot, resolveSide } from '../deadline.constant'
import { DeadlineMessages } from '../deadline.messages'
import { toDeadlineRequestRes } from '../deadline.mapper'
import { DeadlineRepository } from '../deadline.repo'
import {
  DeadlineNotAwaitingBoardException,
  DeadlineRequestAccessDeniedException,
  DeadlineRequestNotFoundException
} from '../errors/deadline.errors'
import { BoardResolveBodyType } from '../schemas/deadline-schemas'
import { DeadlineRequestStateService } from './deadline-request-state.service'

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/
const N = DeadlineMessages.notification

@Injectable()
export class DeadlineFinalizeService {
  constructor(
    private readonly scheduleService: ScheduleService,
    private readonly deadlineRepository: DeadlineRepository,
    private readonly stateService: DeadlineRequestStateService,
    private readonly notificationService: NotificationService
  ) {}

  async finalize(userId: string, id: string) {
    if (!OBJECT_ID_RE.test(id)) throw DeadlineRequestNotFoundException
    const request = await this.deadlineRepository.findById(id)
    if (!request || !request.chapterId || !request.requestedDeadline) throw DeadlineRequestNotFoundException
    const ctx = await this.scheduleService.getDeadlineContext(request.chapterId)
    if (!ctx) throw DeadlineRequestNotFoundException
    const side = resolveSide(userId, ctx.series)
    if (side !== 'EDITOR') throw DeadlineRequestAccessDeniedException

    const affectsSlot = computeAffectsSlot(
      ctx.schedule?.currentDeadline ?? null,
      request.requestedDeadline,
      envConfig.DEADLINE_SLOT_GRACE_HOURS
    )

    if (affectsSlot) {
      const updated = await this.stateService.transition(id, DeadlineRequestStatus.BOARD_REVIEW, {
        by: userId,
        extra: { affectsSlot: true }
      })
      await this.notificationService.notifySafe({
        recipientId: ctx.series.mangakaId,
        type: NotificationType.DEADLINE,
        referenceId: id,
        referenceType: 'DEADLINE_BOARD_REVIEW',
        content: N.boardReview
      })
      return toDeadlineRequestRes(updated)
    }

    const updated = await this.stateService.transition(id, DeadlineRequestStatus.APPROVED, {
      by: userId,
      extra: { affectsSlot: false }
    })
    await this.scheduleService.extendDeadline(userId, request.chapterId, {
      newDeadline: request.requestedDeadline.toISOString(),
      reason: request.reason ?? 'Deadline negotiated (A5)'
    })
    await this.notificationService.notifySafe({
      recipientId: ctx.series.mangakaId,
      type: NotificationType.DEADLINE,
      referenceId: id,
      referenceType: 'DEADLINE_APPROVED',
      content: N.approved
    })
    return toDeadlineRequestRes(updated)
  }

  // A-DL-03: Board chốt request BOARD_REVIEW/ESCALATED → APPROVED (cập nhật Schedule) | REJECTED
  async boardResolve(userId: string, id: string, dto: BoardResolveBodyType) {
    if (!OBJECT_ID_RE.test(id)) throw DeadlineRequestNotFoundException
    const request = await this.deadlineRepository.findById(id)
    if (!request || !request.chapterId || !request.requestedDeadline) throw DeadlineRequestNotFoundException
    if (request.status !== DeadlineRequestStatus.BOARD_REVIEW && request.status !== DeadlineRequestStatus.ESCALATED) {
      throw DeadlineNotAwaitingBoardException
    }
    const ctx = await this.scheduleService.getDeadlineContext(request.chapterId)
    if (!ctx) throw DeadlineRequestNotFoundException

    if (dto.decision === 'APPROVE') {
      const updated = await this.stateService.transition(id, DeadlineRequestStatus.APPROVED, {
        by: userId,
        extra: { boardReviewedBy: userId }
      })
      await this.scheduleService.extendDeadlineByBoard(
        userId,
        request.chapterId,
        request.requestedDeadline,
        request.reason ?? 'Deadline resolved by Board (A5)'
      )
      await this.notifyBoardResolved(ctx.series, id, N.boardApproved, 'DEADLINE_BOARD_APPROVED')
      return toDeadlineRequestRes(updated)
    }

    const updated = await this.stateService.transition(id, DeadlineRequestStatus.REJECTED, {
      by: userId,
      extra: { boardReviewedBy: userId }
    })
    await this.notifyBoardResolved(ctx.series, id, N.boardRejected, 'DEADLINE_BOARD_REJECTED')
    return toDeadlineRequestRes(updated)
  }

  private async notifyBoardResolved(
    series: { mangakaId: string; editorId: string | null },
    id: string,
    content: string,
    referenceType: string
  ) {
    const recipients = [series.mangakaId, series.editorId].filter((r): r is string => !!r)
    for (const recipientId of recipients) {
      await this.notificationService.notifySafe({
        recipientId,
        type: NotificationType.DEADLINE,
        referenceId: id,
        referenceType,
        content
      })
    }
  }
}
