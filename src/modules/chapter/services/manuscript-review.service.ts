import { Injectable } from '@nestjs/common'
import { ManuscriptStatus, NotificationType, PageStatus, RevisionTargetType } from '@prisma/client'
import { NotificationService } from 'src/modules/notification/notification.service'
import { RevisionService } from 'src/modules/revision/revision.service'
import { BLOCKING_TASK_STATUSES } from '../chapter.constant'
import { ChapterMessages } from '../chapter.messages'
import { ChapterRepository } from '../chapter.repo'
import {
  ChapterNotFoundException,
  ChapterOnHoldException,
  NoPagesToSubmitException,
  NotSeriesEditorException,
  NotSeriesOwnerException,
  RevisionNotResolvedException,
  TasksNotAllApprovedException
} from '../errors/chapter.errors'
import { ManuscriptStateService } from './manuscript-state.service'

@Injectable()
export class ManuscriptReviewService {
  constructor(
    private readonly chapterRepository: ChapterRepository,
    private readonly manuscriptStateService: ManuscriptStateService,
    private readonly notificationService: NotificationService,
    private readonly revisionService: RevisionService
  ) {}

  private async loadOwned(chapterId: string) {
    const chapter = await this.chapterRepository.findChapterById(chapterId)
    if (!chapter) throw ChapterNotFoundException
    const series = await this.chapterRepository.findSeriesById(chapter.seriesId)
    if (!series) throw ChapterNotFoundException
    return { chapter, series }
  }

  private assertNotOnHold(chapter: { hold: unknown }) {
    if (chapter.hold) throw ChapterOnHoldException
  }

  private async assertReadyForEditor(chapterId: string) {
    const pages = await this.chapterRepository.findPagesByChapterId(chapterId)
    if (pages.length === 0) throw NoPagesToSubmitException
    const counts = await this.chapterRepository.countTasksByStatusForChapter(chapterId)
    const blocking = BLOCKING_TASK_STATUSES.reduce((sum, status) => sum + (counts[status] ?? 0), 0)
    if (blocking > 0) throw TasksNotAllApprovedException
  }

  async submit(userId: string, chapterId: string) {
    const { chapter, series } = await this.loadOwned(chapterId)
    if (series.mangakaId !== userId) throw NotSeriesOwnerException
    this.assertNotOnHold(chapter)
    await this.manuscriptStateService.assertCanTransition(chapterId, ManuscriptStatus.EDITOR_REVIEW)
    await this.assertReadyForEditor(chapterId)

    const result = await this.manuscriptStateService.transitionWithPages(
      chapterId,
      ManuscriptStatus.EDITOR_REVIEW,
      { changedBy: userId },
      [PageStatus.DRAFT],
      PageStatus.COMPLETED
    )
    if (series.editorId) {
      await this.notificationService.notifySafe({
        recipientId: series.editorId,
        type: NotificationType.REVIEW,
        referenceId: chapterId,
        referenceType: 'MANUSCRIPT_SUBMITTED',
        content: ChapterMessages.notification.manuscriptSubmitted
      })
    }
    return result
  }

  async requestRevision(userId: string, chapterId: string, reason: string) {
    const { chapter, series } = await this.loadOwned(chapterId)
    if (series.editorId !== userId) throw NotSeriesEditorException
    this.assertNotOnHold(chapter)
    await this.manuscriptStateService.assertCanTransition(chapterId, ManuscriptStatus.EDITOR_REVISION)

    const result = await this.manuscriptStateService.transitionWithPages(
      chapterId,
      ManuscriptStatus.EDITOR_REVISION,
      { changedBy: userId, reason },
      [PageStatus.COMPLETED],
      PageStatus.REVISING
    )
    const { round } = await this.revisionService.openSafe({
      targetType: RevisionTargetType.MANUSCRIPT,
      targetId: chapterId,
      seriesId: series.id,
      reason,
      requestedBy: userId,
      recipientId: series.mangakaId
    })
    await this.notificationService.notifySafe({
      recipientId: series.mangakaId,
      type: NotificationType.REVIEW,
      referenceId: chapterId,
      referenceType: 'MANUSCRIPT_REVISION_REQUESTED',
      content: ChapterMessages.notification.editorRequestedRevision(round, reason)
    })
    return result
  }

  async resubmit(userId: string, chapterId: string) {
    const { chapter, series } = await this.loadOwned(chapterId)
    if (series.mangakaId !== userId) throw NotSeriesOwnerException
    this.assertNotOnHold(chapter)
    await this.manuscriptStateService.assertCanTransition(chapterId, ManuscriptStatus.EDITOR_REVIEW)
    if (await this.revisionService.hasOpenRequest(RevisionTargetType.MANUSCRIPT, chapterId)) {
      throw RevisionNotResolvedException
    }
    await this.assertReadyForEditor(chapterId)

    const result = await this.manuscriptStateService.transitionWithPages(
      chapterId,
      ManuscriptStatus.EDITOR_REVIEW,
      { changedBy: userId },
      [PageStatus.REVISING, PageStatus.DRAFT],
      PageStatus.COMPLETED
    )
    if (series.editorId) {
      const round = await this.revisionService.currentRound(RevisionTargetType.MANUSCRIPT, chapterId)
      await this.notificationService.notifySafe({
        recipientId: series.editorId,
        type: NotificationType.REVIEW,
        referenceId: chapterId,
        referenceType: 'MANUSCRIPT_RESUBMITTED',
        content: ChapterMessages.notification.manuscriptResubmitted(round)
      })
    }
    return result
  }

  async approve(userId: string, chapterId: string) {
    const { chapter, series } = await this.loadOwned(chapterId)
    if (series.editorId !== userId) throw NotSeriesEditorException
    this.assertNotOnHold(chapter)
    const result = await this.manuscriptStateService.transition(chapterId, ManuscriptStatus.READY_FOR_PRINT, {
      changedBy: userId
    })
    await this.notificationService.notifySafe({
      recipientId: series.mangakaId,
      type: NotificationType.REVIEW,
      referenceId: chapterId,
      referenceType: 'MANUSCRIPT_APPROVED',
      content: ChapterMessages.notification.manuscriptApproved
    })
    return result
  }
}
