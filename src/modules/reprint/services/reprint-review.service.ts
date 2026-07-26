import { Injectable } from '@nestjs/common'
import { NotificationType } from '@prisma/client'
import { isObjectId } from 'src/core/http/schemas/object-id.schema'
import { RoleName } from 'src/core/security/constants/role.constant'
import { NotificationService } from 'src/modules/notification/notification.service'
import { BoardApproveReprintBodyDto, MangakaReviewReprintBodyDto } from '../dto/reprint-request.dto'
import { ReprintRequestErrors } from '../errors/reprint-request.error'
import { REPRINT_REQUEST_STATUS } from '../reprint-request.constant'
import { ReprintRequestMessages } from '../reprint-request.messages'
import { ReprintRequestRepo } from '../reprint-request.repo'
import { ActorContext } from './reprint-access.policy'
import { toReprintActor } from './reprint-service.helper'
import { ReprintRequestStateService } from './reprint-request-state.service'

@Injectable()
export class ReprintReviewService {
  constructor(
    private readonly repository: ReprintRequestRepo,
    private readonly notificationService: NotificationService,
    private readonly stateService: ReprintRequestStateService
  ) {}

  async mangakaReview(id: string, dto: MangakaReviewReprintBodyDto, actorValue: ActorContext | string) {
    const actorId = toReprintActor(actorValue, RoleName.MANGAKA).userId
    const request = await this.loadRequest(id)
    const contract = await this.repository.findActiveContractBySeriesId(request.seriesId)
    if (!contract || contract.contractType !== 'REVENUE_SHARE' || contract.mangakaId !== actorId) {
      throw ReprintRequestErrors.ActionNotAllowed()
    }
    if (request.status !== REPRINT_REQUEST_STATUS.PENDING && request.status !== REPRINT_REQUEST_STATUS.PROPOSED) {
      throw ReprintRequestErrors.InvalidReprintTransition()
    }

    const nextStatus = dto.accept ? REPRINT_REQUEST_STATUS.MANGAKA_APPROVED : REPRINT_REQUEST_STATUS.REJECTED_BY_MANGAKA
    const updated = await this.stateService.transition(
      id,
      request.status,
      nextStatus,
      actorId,
      dto.accept ? 'mangaka review accepted' : 'mangaka review rejected',
      dto.accept ? { mangakaApprovedAt: new Date() } : {}
    )
    await this.notificationService.notifySafe({
      recipientId: request.requestedBy ?? '',
      type: NotificationType.CONTRACT,
      referenceId: updated.id,
      referenceType: dto.accept ? 'REPRINT_REQUEST_MANGAKA_APPROVED' : 'REPRINT_REQUEST_REJECTED',
      content: dto.accept
        ? ReprintRequestMessages.notification.mangakaApproved
        : ReprintRequestMessages.notification.mangakaRejected
    })
    return updated
  }

  async boardApprove(id: string, dto: BoardApproveReprintBodyDto, actorValue: ActorContext | string) {
    const actorId = toReprintActor(actorValue, RoleName.BOARD_MEMBER).userId
    const request = await this.loadRequest(id)
    if (!dto.approve) return this.rejectByBoard(request, actorId)

    const contract = await this.repository.findActiveContractBySeriesId(request.seriesId)
    if (!contract) throw ReprintRequestErrors.ContractNotFound()
    if (
      contract.contractType === 'FULL_BUYOUT' &&
      request.status !== REPRINT_REQUEST_STATUS.PENDING &&
      request.status !== REPRINT_REQUEST_STATUS.PROPOSED
    ) {
      throw ReprintRequestErrors.InvalidReprintTransition()
    }
    if (
      contract.contractType === 'REVENUE_SHARE' &&
      request.status !== REPRINT_REQUEST_STATUS.MANGAKA_APPROVED &&
      request.status !== REPRINT_REQUEST_STATUS.MANGAKA_REVIEW
    ) {
      throw ReprintRequestErrors.InvalidReprintTransition()
    }

    const updated = await this.stateService.transition(
      id,
      request.status,
      REPRINT_REQUEST_STATUS.BOARD_APPROVED,
      actorId,
      'board approved',
      { boardApprovedAt: new Date() }
    )
    await Promise.all([
      this.notificationService.notifySafe({
        recipientId: request.requestedBy ?? '',
        type: NotificationType.CONTRACT,
        referenceId: updated.id,
        referenceType: 'REPRINT_REQUEST_BOARD_APPROVED',
        content: ReprintRequestMessages.notification.boardApproved
      }),
      contract.mangakaId
        ? this.notificationService.notifySafe({
            recipientId: contract.mangakaId,
            type: NotificationType.CONTRACT,
            referenceId: updated.id,
            referenceType: 'REPRINT_REQUEST_BOARD_APPROVED',
            content: ReprintRequestMessages.notification.boardApproved
          })
        : Promise.resolve()
    ])
    return updated
  }

  private async rejectByBoard(
    request: Awaited<ReturnType<ReprintRequestRepo['findById']>> & { id: string },
    actorId: string
  ) {
    const updated = await this.stateService.transition(
      request.id,
      request.status,
      REPRINT_REQUEST_STATUS.REJECTED,
      actorId,
      'board rejected'
    )
    await this.notificationService.notifySafe({
      recipientId: request.requestedBy ?? '',
      type: NotificationType.CONTRACT,
      referenceId: updated.id,
      referenceType: 'REPRINT_REQUEST_REJECTED',
      content: ReprintRequestMessages.notification.boardRejected
    })
    return updated
  }

  private async loadRequest(id: string) {
    if (!isObjectId(id)) throw ReprintRequestErrors.NotFound()
    const request = await this.repository.findById(id)
    if (!request) throw ReprintRequestErrors.NotFound()
    return request
  }
}
