import { Injectable } from '@nestjs/common'
import { StoryboardStatus, NotificationType, RevisionTargetType } from '@prisma/client'
import { DomainEventBus } from 'src/core/events/domain-event-bus.service'
import { DomainEvent } from 'src/core/events/domain-events'
import { AppConfigService } from 'src/modules/app-config/app-config.service'
import { NotificationService } from 'src/modules/notification/notification.service'
import { RevisionService } from 'src/modules/revision/revision.service'
import { InvalidStoryboardStateException } from '../errors/storyboard.errors'
import { requireAssignedEditor } from '../storyboard-editor.guard'
import { toStoryboardRes } from '../storyboard.mapper'
import { StoryboardMessages } from '../storyboard.messages'
import { StoryboardRepo } from '../storyboard.repo'
import { StoryboardAccessService, StoryboardScope } from './storyboard-access.service'

const N = StoryboardMessages.notification

// Spec 28: Storyboard giờ chỉ phục vụ phác thảo CHƯƠNG → chỉ còn chapter-scoped review.
@Injectable()
export class StoryboardReviewService {
  constructor(
    private readonly access: StoryboardAccessService,
    private readonly repository: StoryboardRepo,
    private readonly eventBus: DomainEventBus,
    private readonly notificationService: NotificationService,
    private readonly appConfigService: AppConfigService,
    private readonly revisionService: RevisionService
  ) {}

  async chapterRequestRevision(editorId: string, chapterId: string, storyboardId: string, reason: string) {
    const seriesId = await this.access.chapterSeriesId(chapterId)
    return this.doRequestRevision(editorId, seriesId, chapterId, storyboardId, reason)
  }

  private async doRequestRevision(
    editorId: string,
    seriesId: string,
    chapterId: string,
    storyboardId: string,
    reason: string
  ) {
    const scope: StoryboardScope = { chapterId }
    const { series, storyboard } = await this.access.requireSeriesStoryboard(seriesId, storyboardId, scope)
    requireAssignedEditor(series, editorId)
    if (storyboard.status !== StoryboardStatus.SUBMITTED && storyboard.status !== StoryboardStatus.IN_REVIEW) {
      throw InvalidStoryboardStateException
    }
    const updated = await this.repository.updateStoryboardStatus(storyboardId, {
      status: StoryboardStatus.REVISION
    })
    const { round } = await this.revisionService.openSafe({
      targetType: RevisionTargetType.STORYBOARD,
      targetId: storyboardId,
      seriesId,
      reason,
      requestedBy: editorId,
      recipientId: series.mangakaId
    })
    await this.notificationService.notifySafe({
      recipientId: series.mangakaId,
      type: NotificationType.SYSTEM,
      referenceId: storyboardId,
      referenceType: 'STORYBOARD_REVISION_REQUESTED',
      content: N.storyboardRevision(round, reason)
    })
    return toStoryboardRes(updated)
  }

  async chapterResubmit(mangakaId: string, chapterId: string, storyboardId: string) {
    const seriesId = await this.access.chapterSeriesId(chapterId)
    return this.doResubmit(mangakaId, seriesId, chapterId, storyboardId)
  }

  private async doResubmit(mangakaId: string, seriesId: string, chapterId: string, storyboardId: string) {
    const scope: StoryboardScope = { chapterId }
    const { series, storyboard } = await this.access.requireOwnerStoryboard(seriesId, mangakaId, storyboardId, scope)
    if (storyboard.status !== StoryboardStatus.REVISION) throw InvalidStoryboardStateException
    const updated = await this.repository.updateStoryboardStatus(storyboardId, {
      status: StoryboardStatus.IN_REVIEW,
      version: storyboard.version + 1
    })
    if (series.editorId) {
      const round = await this.revisionService.currentRound(RevisionTargetType.STORYBOARD, storyboardId)
      await this.notificationService.notifySafe({
        recipientId: series.editorId,
        type: NotificationType.REVIEW,
        referenceId: storyboardId,
        referenceType: 'STORYBOARD_RESUBMITTED',
        content: N.storyboardResubmitted(round)
      })
    }
    const config = await this.appConfigService.get()
    if (updated.version >= config.storyboardMaxReviewRounds && series.editorId) {
      await this.notificationService.notifySafe({
        recipientId: series.editorId,
        type: NotificationType.REVIEW,
        referenceId: storyboardId,
        referenceType: 'STORYBOARD_LOOP_WARNING',
        content: N.storyboardLoopWarning(updated.version)
      })
    }
    return toStoryboardRes(updated)
  }

  async chapterApprove(editorId: string, chapterId: string, storyboardId: string) {
    const seriesId = await this.access.chapterSeriesId(chapterId)
    return this.doApprove(editorId, seriesId, chapterId, storyboardId)
  }

  private async doApprove(editorId: string, seriesId: string, chapterId: string, storyboardId: string) {
    const scope: StoryboardScope = { chapterId }
    const { series, storyboard } = await this.access.requireSeriesStoryboard(seriesId, storyboardId, scope)
    requireAssignedEditor(series, editorId)
    if (storyboard.status !== StoryboardStatus.SUBMITTED && storyboard.status !== StoryboardStatus.IN_REVIEW) {
      throw InvalidStoryboardStateException
    }
    const updated = await this.repository.updateStoryboardStatus(storyboardId, {
      status: StoryboardStatus.APPROVED
    })
    // Spec 28: bỏ field `kind` — Storyboard luôn thuộc chapter, listener luôn nhận chapterId.
    this.eventBus.emit(DomainEvent.StoryboardApproved, {
      seriesId,
      storyboardId,
      chapterId
    })
    await this.notificationService.notifySafe({
      recipientId: series.mangakaId,
      type: NotificationType.SYSTEM,
      referenceId: seriesId,
      referenceType: 'STORYBOARD_APPROVED',
      content: N.storyboardApproved
    })
    return toStoryboardRes(updated)
  }
}
