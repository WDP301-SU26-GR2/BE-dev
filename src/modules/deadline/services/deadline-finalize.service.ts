import { Injectable } from '@nestjs/common'
import { DeadlineRequestStatus, NotificationType } from '@prisma/client'
import envConfig from 'src/core/config/envConfig'
import { ScheduleService } from 'src/modules/chapter/services/schedule.service'
import { NotificationService } from 'src/modules/notification/notification.service'
import { computeAffectsSlot, resolveSide } from '../deadline.constant'
import { DeadlineMessages } from '../deadline.messages'
import { toDeadlineRequestRes } from '../deadline.mapper'
import { DeadlineRepository } from '../deadline.repo'
import { DeadlineRequestAccessDeniedException, DeadlineRequestNotFoundException } from '../errors/deadline.errors'
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
      // B5-INTEGRATION: BoardEscalationPort.escalate({ kind: 'DEADLINE_SLOT', ... }) when B5 is ready.
      await this.notificationService.notify({
        recipientId: ctx.series.mangakaId,
        type: NotificationType.DEADLINE,
        referenceId: id,
        referenceType: 'DeadlineRequest',
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
    await this.notificationService.notify({
      recipientId: ctx.series.mangakaId,
      type: NotificationType.DEADLINE,
      referenceId: id,
      referenceType: 'DeadlineRequest',
      content: N.approved
    })
    return toDeadlineRequestRes(updated)
  }
}
