import { Injectable } from '@nestjs/common'
import { isObjectId } from 'src/core/http/schemas/object-id.schema'
import { AuditEntityType, NotificationType } from '@prisma/client'
import { AuditService } from 'src/modules/audit/audit.service'
import { NotificationService } from 'src/modules/notification/notification.service'
import { RoleName } from 'src/core/security/constants/role.constant'
import { EditorApproveChapterBodyDto, SubmitChapterManuscriptBodyDto } from '../dto/reprint-request.dto'
import { ReprintRequestErrors } from '../errors/reprint-request.error'
import { REPRINT_CHAPTER_STATUS, REPRINT_REQUEST_STATUS } from '../reprint-request.constant'
import { ReprintRequestMessages } from '../reprint-request.messages'
import { ReprintRequestRepo } from '../reprint-request.repo'
import { ActorContext, ReprintAccessPolicy, ReprintAccessSubject } from './reprint-access.policy'
import { ReprintRequestStateService } from './reprint-request-state.service'
import { loadReprintAccessContext, toReprintActor } from './reprint-service.helper'

@Injectable()
export class ReprintChapterService {
  constructor(
    private readonly repository: ReprintRequestRepo,
    private readonly notificationService: NotificationService,
    private readonly auditService: AuditService,
    private readonly stateService: ReprintRequestStateService,
    private readonly accessPolicy: ReprintAccessPolicy
  ) {}

  async updateChapterManuscript(
    id: string,
    chapterId: string,
    dto: SubmitChapterManuscriptBodyDto,
    actorValue: ActorContext | string
  ) {
    const actor = toReprintActor(actorValue, RoleName.MANGAKA)
    const request = await this.loadRequestAndSubject(id, chapterId, actor, 'manuscript')
    if (
      request.status !== REPRINT_REQUEST_STATUS.BOARD_APPROVED &&
      request.status !== REPRINT_REQUEST_STATUS.APPROVED
    ) {
      throw ReprintRequestErrors.InvalidReprintTransition()
    }

    const chapters = [...(request.chapters ?? [])]
    const targetChapter = chapters.find((item) => item.originalChapterId === chapterId)
    if (!targetChapter) throw ReprintRequestErrors.ChapterNotFound()

    targetChapter.manuscriptFile = dto.manuscriptFile
    targetChapter.status = REPRINT_CHAPTER_STATUS.READY

    const updated = await this.repository.update(id, { chapters })
    await this.notificationService.notifySafe({
      recipientId: request.requestedBy ?? '',
      type: NotificationType.CONTRACT,
      referenceId: updated.id,
      referenceType: 'REPRINT_CHAPTER_SUBMITTED',
      content: ReprintRequestMessages.notification.chapterSubmitted
    })
    await this.auditService.record({
      actorId: actor.userId,
      entityType: AuditEntityType.REPRINT_REQUEST,
      entityId: id,
      action: 'CHAPTER_MANUSCRIPT_SUBMITTED',
      reason: `chapter=${chapterId}`
    })
    return updated
  }

  async approveChapter(
    id: string,
    chapterId: string,
    dto: EditorApproveChapterBodyDto,
    actorValue: ActorContext | string
  ) {
    const actor = toReprintActor(actorValue, RoleName.EDITOR)
    const request = await this.loadRequestAndSubject(id, chapterId, actor, 'approve')
    if (
      request.status !== REPRINT_REQUEST_STATUS.BOARD_APPROVED &&
      request.status !== REPRINT_REQUEST_STATUS.APPROVED
    ) {
      throw ReprintRequestErrors.InvalidReprintTransition()
    }

    const chapters = [...(request.chapters ?? [])]
    const targetChapter = chapters.find((item) => item.originalChapterId === chapterId)
    if (!targetChapter) throw ReprintRequestErrors.ChapterNotFound()
    targetChapter.status = dto.approve ? REPRINT_CHAPTER_STATUS.APPROVED : REPRINT_CHAPTER_STATUS.IN_REVISION

    if (chapters.every((chapter) => chapter.status === REPRINT_CHAPTER_STATUS.APPROVED)) {
      const contract = await this.repository.findActiveContractBySeriesId(request.seriesId)
      const updated = await this.stateService.transition(
        id,
        request.status,
        REPRINT_REQUEST_STATUS.PUBLISHED,
        actor.userId,
        'all chapters approved',
        { chapters, publishedAt: new Date() }
      )
      await Promise.all([
        this.notificationService.notifySafe({
          recipientId: request.requestedBy ?? '',
          type: NotificationType.CONTRACT,
          referenceId: updated.id,
          referenceType: 'REPRINT_REQUEST_PUBLISHED',
          content: ReprintRequestMessages.notification.published
        }),
        contract?.mangakaId
          ? this.notificationService.notifySafe({
              recipientId: contract.mangakaId,
              type: NotificationType.CONTRACT,
              referenceId: updated.id,
              referenceType: 'REPRINT_REQUEST_PUBLISHED',
              content: ReprintRequestMessages.notification.published
            })
          : Promise.resolve()
      ])
      return updated
    }

    const updated = await this.repository.update(id, { chapters })
    await this.notificationService.notifySafe({
      recipientId: request.requestedBy ?? '',
      type: NotificationType.CONTRACT,
      referenceId: updated.id,
      referenceType: 'REPRINT_CHAPTER_REVIEWED',
      content: ReprintRequestMessages.notification.chapterReviewed
    })
    return updated
  }

  private async loadRequestAndSubject(
    id: string,
    chapterId: string,
    actor: ActorContext,
    operation: 'manuscript' | 'approve'
  ) {
    if (!isObjectId(id) || !isObjectId(chapterId)) throw ReprintRequestErrors.NotFound()
    const request = await this.repository.findById(id)
    if (!request) throw ReprintRequestErrors.NotFound()
    const access = await loadReprintAccessContext(
      this.repository,
      request.seriesId,
      operation === 'approve' ? actor.userId : (request.requestedBy ?? null),
      operation === 'manuscript' ? actor.userId : undefined
    )
    const subject: ReprintAccessSubject = { ...access, chapters: request.chapters ?? [] }
    const allowed =
      operation === 'manuscript'
        ? this.accessPolicy.canUpdateManuscript(actor, subject, chapterId)
        : this.accessPolicy.canCreateOrApprove(actor, subject)
    if (!allowed) throw ReprintRequestErrors.ActionNotAllowed()
    return request
  }
}
