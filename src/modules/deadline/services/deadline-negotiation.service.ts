import { Injectable } from '@nestjs/common'
import { ChapterStatus, DeadlineRequest, DeadlineRequestStatus, NotificationType } from '@prisma/client'
import envConfig from 'src/core/config/envConfig'
import { NotificationService } from 'src/modules/notification/notification.service'
import { ScheduleService } from 'src/modules/chapter/services/schedule.service'
import { computeAffectsSlot, DeadlineSide, resolveSide } from '../deadline.constant'
import { DeadlineMessages } from '../deadline.messages'
import { toDeadlineRequestRes } from '../deadline.mapper'
import { DeadlineRepository } from '../deadline.repo'
import {
  CounterDeadlineBodyType,
  CreateDeadlineRequestBodyType,
  DeadlineReasonBodyType
} from '../schemas/deadline-schemas'
import { DeadlineRequestStateService } from './deadline-request-state.service'
import {
  DeadlineRequestAccessDeniedException,
  DeadlineRequestNotAllowedException,
  DeadlineRequestNotFoundException,
  NotCounterpartyException,
  OpenDeadlineRequestExistsException
} from '../errors/deadline.errors'

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/
const N = DeadlineMessages.notification

@Injectable()
export class DeadlineNegotiationService {
  constructor(
    private readonly scheduleService: ScheduleService,
    private readonly deadlineRepository: DeadlineRepository,
    private readonly stateService: DeadlineRequestStateService,
    private readonly notificationService: NotificationService
  ) {}

  private getCounterpartyId(series: { mangakaId: string; editorId: string | null }, side: DeadlineSide) {
    return side === 'MANGAKA' ? series.editorId : series.mangakaId
  }

  private async notify(
    recipientId: string | null | undefined,
    content: string,
    requestId: string,
    referenceType: string
  ) {
    if (!recipientId) return
    await this.notificationService.notifySafe({
      recipientId,
      type: NotificationType.DEADLINE,
      referenceId: requestId,
      referenceType,
      content
    })
  }

  private async getContextForChapter(chapterId: string) {
    if (!OBJECT_ID_RE.test(chapterId)) throw DeadlineRequestNotFoundException
    const ctx = await this.scheduleService.getDeadlineContext(chapterId)
    if (!ctx || !ctx.schedule) throw DeadlineRequestNotFoundException
    return ctx
  }

  private async getActionContext(id: string, userId: string) {
    if (!OBJECT_ID_RE.test(id)) throw DeadlineRequestNotFoundException
    const request = await this.deadlineRepository.findById(id)
    if (!request || !request.chapterId) throw DeadlineRequestNotFoundException
    const ctx = await this.getContextForChapter(request.chapterId)
    const side = resolveSide(userId, ctx.series)
    if (!side) throw DeadlineRequestAccessDeniedException
    return { request, ctx, side }
  }

  private assertCounterparty(request: DeadlineRequest, side: DeadlineSide) {
    if (!request.lastProposedBy || request.lastProposedBy === side) throw NotCounterpartyException
  }

  async create(userId: string, body: CreateDeadlineRequestBodyType) {
    const ctx = await this.getContextForChapter(body.chapterId)
    const { schedule } = ctx
    if (!schedule) throw DeadlineRequestNotFoundException
    const side = resolveSide(userId, ctx.series)
    if (!side) throw DeadlineRequestAccessDeniedException
    if (ctx.chapter.status === ChapterStatus.PUBLISHED) throw DeadlineRequestNotAllowedException
    const existingOpen = await this.deadlineRepository.findOpenByChapter(body.chapterId)
    if (existingOpen) throw OpenDeadlineRequestExistsException

    const requestedDeadline = new Date(body.requestedDeadline)
    const affectsSlot = computeAffectsSlot(
      schedule.currentDeadline ?? null,
      requestedDeadline,
      envConfig.DEADLINE_SLOT_GRACE_HOURS
    )
    const request = await this.deadlineRepository.create({
      scheduleId: schedule.id,
      chapterId: ctx.chapter.id,
      seriesId: ctx.chapter.seriesId,
      requestedBy: side,
      currentDeadline: schedule.currentDeadline ?? null,
      requestedDeadline,
      reason: body.reason,
      affectsSlot,
      createdById: userId
    })

    await this.notify(this.getCounterpartyId(ctx.series, side), N.proposed, request.id, 'DEADLINE_PROPOSED')
    return toDeadlineRequestRes(request)
  }

  async counter(userId: string, id: string, body: CounterDeadlineBodyType) {
    const { request, ctx, side } = await this.getActionContext(id, userId)
    const { schedule } = ctx
    if (!schedule) throw DeadlineRequestNotFoundException
    this.assertCounterparty(request, side)
    const requestedDeadline = new Date(body.requestedDeadline)
    const affectsSlot = computeAffectsSlot(
      request.currentDeadline ?? schedule.currentDeadline ?? null,
      requestedDeadline,
      envConfig.DEADLINE_SLOT_GRACE_HOURS
    )
    const updated = await this.stateService.transition(id, DeadlineRequestStatus.COUNTER_PROPOSED, {
      by: userId,
      reason: body.reason,
      extra: {
        requestedDeadline,
        reason: body.reason,
        affectsSlot,
        lastProposedBy: side
      }
    })

    await this.notify(this.getCounterpartyId(ctx.series, side), N.counterProposed, updated.id, 'DEADLINE_COUNTERED')
    return toDeadlineRequestRes(updated)
  }

  async agree(userId: string, id: string) {
    const { request, ctx, side } = await this.getActionContext(id, userId)
    this.assertCounterparty(request, side)
    const updated = await this.stateService.transition(id, DeadlineRequestStatus.AGREED_BY_PARTIES, { by: userId })

    await this.notify(this.getCounterpartyId(ctx.series, side), N.agreed, updated.id, 'DEADLINE_AGREED')
    return toDeadlineRequestRes(updated)
  }

  async reject(userId: string, id: string, body: DeadlineReasonBodyType) {
    const { request, ctx, side } = await this.getActionContext(id, userId)
    this.assertCounterparty(request, side)
    const updated = await this.stateService.transition(id, DeadlineRequestStatus.ESCALATED, {
      by: userId,
      reason: body.reason
    })
    // B5-INTEGRATION: BoardEscalationPort.escalate({ kind: 'DEADLINE_DISPUTE', ... }) when B5 is ready.

    await this.notify(this.getCounterpartyId(ctx.series, side), N.rejected, updated.id, 'DEADLINE_REJECTED')
    return toDeadlineRequestRes(updated)
  }

  async withdraw(userId: string, id: string) {
    const { request, ctx, side } = await this.getActionContext(id, userId)
    if (request.requestedBy !== side) throw DeadlineRequestAccessDeniedException
    const updated = await this.stateService.transition(id, DeadlineRequestStatus.REJECTED, { by: userId })

    await this.notify(this.getCounterpartyId(ctx.series, side), N.withdrawn, updated.id, 'DEADLINE_WITHDRAWN')
    return toDeadlineRequestRes(updated)
  }
}
