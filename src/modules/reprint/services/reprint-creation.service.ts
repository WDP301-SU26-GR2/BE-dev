import { Injectable } from '@nestjs/common'
import { NotificationType } from '@prisma/client'
import { isObjectId } from 'src/core/http/schemas/object-id.schema'
import { RoleName } from 'src/core/security/constants/role.constant'
import { NotificationService } from 'src/modules/notification/notification.service'
import { CreateReprintRequestBodyDto } from '../dto/reprint-request.dto'
import { ReprintRequestErrors } from '../errors/reprint-request.error'
import { REPRINT_CHAPTER_STATUS, REPRINT_REQUEST_STATUS } from '../reprint-request.constant'
import { ReprintRequestMessages } from '../reprint-request.messages'
import { ReprintRequestRepo } from '../reprint-request.repo'
import { ActorContext, ReprintAccessPolicy } from './reprint-access.policy'
import { loadReprintAccessContext, toReprintActor } from './reprint-service.helper'

@Injectable()
export class ReprintCreationService {
  constructor(
    private readonly repository: ReprintRequestRepo,
    private readonly notificationService: NotificationService,
    private readonly accessPolicy: ReprintAccessPolicy
  ) {}

  async create(actorValue: ActorContext | string, dto: CreateReprintRequestBodyDto) {
    const actor = toReprintActor(actorValue, RoleName.EDITOR)
    if (!isObjectId(dto.seriesId)) throw ReprintRequestErrors.ContractNotFound()
    const access = await loadReprintAccessContext(this.repository, dto.seriesId, actor.userId)
    if (!this.accessPolicy.canCreateOrApprove(actor, { ...access, chapters: [] })) {
      throw ReprintRequestErrors.ActionNotAllowed()
    }
    const contract = await this.repository.findActiveContractBySeriesId(dto.seriesId)
    if (!contract) throw ReprintRequestErrors.ContractNotFound()

    const originalChapters = await this.repository.findOriginalChaptersByRange(
      dto.seriesId,
      dto.chapterRangeStart,
      dto.chapterRangeEnd
    )
    if (!originalChapters || originalChapters.length === 0) {
      throw ReprintRequestErrors.OriginalChaptersNotFound()
    }

    const created = await this.repository.create({
      seriesId: dto.seriesId,
      requestedBy: actor.userId,
      revisionMode: dto.revisionMode,
      reason: dto.reason,
      chapterRangeStart: dto.chapterRangeStart,
      chapterRangeEnd: dto.chapterRangeEnd,
      status: REPRINT_REQUEST_STATUS.PENDING,
      chapters: originalChapters.map((chapter) => ({
        originalChapterId: chapter.id,
        manuscriptFile: null,
        status: REPRINT_CHAPTER_STATUS.PENDING
      }))
    })

    await Promise.all([
      this.notificationService.notifySafe({
        recipientId: actor.userId,
        type: NotificationType.CONTRACT,
        referenceId: created.id,
        referenceType: 'REPRINT_REQUEST_CREATED',
        content: ReprintRequestMessages.notification.created
      }),
      contract.mangakaId
        ? this.notificationService.notifySafe({
            recipientId: contract.mangakaId,
            type: NotificationType.CONTRACT,
            referenceId: created.id,
            referenceType: 'REPRINT_REQUEST_CREATED',
            content: ReprintRequestMessages.notification.createdForMangaka
          })
        : Promise.resolve()
    ])
    return created
  }
}
