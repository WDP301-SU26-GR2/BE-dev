import { Injectable } from '@nestjs/common'
import { NameKind, NameStatus, NotificationType, RevisionTargetType, SeriesStatus } from '@prisma/client'
import { DomainEventBus } from 'src/core/events/domain-event-bus.service'
import { DomainEvent } from 'src/core/events/domain-events'
import { AppConfigService } from 'src/modules/app-config/app-config.service'
import { NotificationService } from 'src/modules/notification/notification.service'
import { RevisionService } from 'src/modules/revision/revision.service'
import { InvalidNameStateException } from '../errors/name.errors'
import { requireAssignedEditor } from '../name-editor.guard'
import { toNameRes } from '../name.mapper'
import { NameMessages } from '../name.messages'
import { NameRepo } from '../name.repo'
import { NameAccessService, NameScope } from './name-access.service'

const N = NameMessages.notification

@Injectable()
export class NameReviewService {
  constructor(
    private readonly access: NameAccessService,
    private readonly repository: NameRepo,
    private readonly eventBus: DomainEventBus,
    private readonly notificationService: NotificationService,
    private readonly appConfigService: AppConfigService,
    private readonly revisionService: RevisionService
  ) {}

  requestRevision(editorId: string, seriesId: string, nameId: string, reason: string) {
    return this.doRequestRevision(editorId, seriesId, nameId, reason, { kind: NameKind.PROPOSAL })
  }

  async chapterRequestRevision(editorId: string, chapterId: string, nameId: string, reason: string) {
    const seriesId = await this.access.chapterSeriesId(chapterId)
    return this.doRequestRevision(editorId, seriesId, nameId, reason, { kind: NameKind.CHAPTER, chapterId })
  }

  private async doRequestRevision(
    editorId: string,
    seriesId: string,
    nameId: string,
    reason: string,
    scope: NameScope & { kind: NameKind }
  ) {
    const { series, name } = await this.access.requireSeriesName(seriesId, nameId, scope)
    requireAssignedEditor(series, editorId)
    const reopenable =
      scope.kind === NameKind.PROPOSAL &&
      name.status === NameStatus.APPROVED &&
      series.status === SeriesStatus.IN_REVIEW
    if (name.status !== NameStatus.SUBMITTED && name.status !== NameStatus.IN_REVIEW && !reopenable) {
      throw InvalidNameStateException
    }
    const updated = await this.repository.updateNameStatus(nameId, { status: NameStatus.REVISION })
    const { round } = await this.revisionService.openSafe({
      targetType: RevisionTargetType.NAME,
      targetId: nameId,
      seriesId,
      reason,
      requestedBy: editorId,
      recipientId: series.mangakaId
    })
    await this.notificationService.notifySafe({
      recipientId: series.mangakaId,
      type: NotificationType.SYSTEM,
      referenceId: nameId,
      referenceType: 'NAME_REVISION_REQUESTED',
      content: N.nameRevision(round, reason)
    })
    return toNameRes(updated)
  }

  resubmit(mangakaId: string, seriesId: string, nameId: string) {
    return this.doResubmit(mangakaId, seriesId, nameId, { kind: NameKind.PROPOSAL })
  }

  async chapterResubmit(mangakaId: string, chapterId: string, nameId: string) {
    const seriesId = await this.access.chapterSeriesId(chapterId)
    return this.doResubmit(mangakaId, seriesId, nameId, { kind: NameKind.CHAPTER, chapterId })
  }

  private async doResubmit(mangakaId: string, seriesId: string, nameId: string, scope: NameScope & { kind: NameKind }) {
    const { series, name } = await this.access.requireOwnerName(seriesId, mangakaId, nameId, scope)
    if (name.status !== NameStatus.REVISION) throw InvalidNameStateException
    const updated = await this.repository.updateNameStatus(nameId, {
      status: NameStatus.IN_REVIEW,
      version: name.version + 1
    })
    if (series.editorId) {
      const round = await this.revisionService.currentRound(RevisionTargetType.NAME, nameId)
      await this.notificationService.notifySafe({
        recipientId: series.editorId,
        type: NotificationType.REVIEW,
        referenceId: nameId,
        referenceType: 'NAME_RESUBMITTED',
        content: N.nameResubmitted(round)
      })
    }
    const config = await this.appConfigService.get()
    if (updated.version >= config.nameMaxReviewRounds && series.editorId) {
      await this.notificationService.notifySafe({
        recipientId: series.editorId,
        type: NotificationType.REVIEW,
        referenceId: nameId,
        referenceType: 'NAME_LOOP_WARNING',
        content: N.nameLoopWarning(updated.version)
      })
    }
    return toNameRes(updated)
  }

  approve(editorId: string, seriesId: string, nameId: string) {
    return this.doApprove(editorId, seriesId, nameId, { kind: NameKind.PROPOSAL })
  }

  async chapterApprove(editorId: string, chapterId: string, nameId: string) {
    const seriesId = await this.access.chapterSeriesId(chapterId)
    return this.doApprove(editorId, seriesId, nameId, { kind: NameKind.CHAPTER, chapterId })
  }

  private async doApprove(editorId: string, seriesId: string, nameId: string, scope: NameScope & { kind: NameKind }) {
    const { series, name } = await this.access.requireSeriesName(seriesId, nameId, scope)
    requireAssignedEditor(series, editorId)
    if (name.status !== NameStatus.SUBMITTED && name.status !== NameStatus.IN_REVIEW) {
      throw InvalidNameStateException
    }
    const updated = await this.repository.updateNameStatus(nameId, { status: NameStatus.APPROVED })
    this.eventBus.emit(DomainEvent.NameApproved, {
      seriesId,
      nameId,
      kind: updated.kind,
      ...(updated.kind === NameKind.CHAPTER && updated.chapterId ? { chapterId: updated.chapterId } : {})
    })
    await this.notificationService.notifySafe({
      recipientId: series.mangakaId,
      type: NotificationType.SYSTEM,
      referenceId: seriesId,
      referenceType: 'NAME_APPROVED',
      content: N.nameApproved
    })
    return toNameRes(updated)
  }
}
