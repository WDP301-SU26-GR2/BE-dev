import { Injectable } from '@nestjs/common'
import { AuditEntityType, NotificationType } from '@prisma/client'
import { isObjectId } from 'src/core/http/schemas/object-id.schema'
import { RoleName } from 'src/core/security/constants/role.constant'
import { AuditService } from 'src/modules/audit/audit.service'
import { NotificationService } from 'src/modules/notification/notification.service'
import { ReprintRequestErrors } from '../errors/reprint-request.error'
import { ReprintRequestMessages } from '../reprint-request.messages'
import { ReprintRequestRepo } from '../reprint-request.repo'
import { AssignReviserBodyType } from '../schemas/reprint-request-schema'
import { ActorContext, ReprintAccessPolicy } from './reprint-access.policy'
import { loadReprintAccessContext, toReprintActor } from './reprint-service.helper'

@Injectable()
export class ReprintAssignmentService {
  constructor(
    private readonly repository: ReprintRequestRepo,
    private readonly notificationService: NotificationService,
    private readonly auditService: AuditService,
    private readonly accessPolicy: ReprintAccessPolicy
  ) {}

  async assignReviser(id: string, chapterId: string, dto: AssignReviserBodyType, actorValue: ActorContext | string) {
    const actor = toReprintActor(actorValue, RoleName.EDITOR)
    if (!isObjectId(id) || !isObjectId(chapterId)) throw ReprintRequestErrors.NotFound()
    const request = await this.repository.findById(id)
    if (!request) throw ReprintRequestErrors.NotFound()
    const access = await loadReprintAccessContext(this.repository, request.seriesId, actor.userId)
    if (!this.accessPolicy.canAssignReviser(actor, { ...access, chapters: request.chapters ?? [] })) {
      throw ReprintRequestErrors.ActionNotAllowed()
    }
    if (request.revisionMode !== 'WITH_REVISION') throw ReprintRequestErrors.NotWithRevision()

    const contract = await this.repository.findActiveContractBySeriesId(request.seriesId)
    if (!contract || contract.contractType !== 'FULL_BUYOUT') {
      throw ReprintRequestErrors.ReviserOnlyForFullBuyout()
    }
    if (dto.reviserType === 'OTHER_MANGAKA') {
      const user = await this.repository.findUserRole(dto.reviserId)
      if (!user || user.role?.code !== 'MANGAKA') throw ReprintRequestErrors.ReviserMangakaNotFound()
    }

    const chapters = [...(request.chapters ?? [])]
    const target = chapters.find((chapter) => chapter.originalChapterId === chapterId)
    if (!target) throw ReprintRequestErrors.ChapterNotFound()
    target.reviserId = dto.reviserId
    target.reviserType = dto.reviserType
    const updated = await this.repository.update(id, { chapters })
    await this.notificationService.notifySafe({
      recipientId: dto.reviserId,
      type: NotificationType.CONTRACT,
      referenceId: id,
      referenceType: 'REPRINT_REVISION_ASSIGNED',
      content: ReprintRequestMessages.notification.reviserAssigned
    })
    await this.auditService.record({
      actorId: actor.userId,
      entityType: AuditEntityType.REPRINT_REQUEST,
      entityId: id,
      action: 'REVISER_ASSIGNED',
      reason: ReprintRequestMessages.reason.reviserAssigned(dto.reviserType, dto.reviserId, chapterId)
    })
    return updated
  }
}
