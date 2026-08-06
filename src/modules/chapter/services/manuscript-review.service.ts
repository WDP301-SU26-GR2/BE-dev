import { Injectable, Optional } from '@nestjs/common'
import {
  ManuscriptStatus,
  NotificationType,
  PageStatus,
  ProductionStageStatus,
  RevisionTargetType
} from '@prisma/client'
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
import { ProductionNotFinalizedException } from '../errors/production-stage.errors'
import { ProductionStageRepository } from '../production-stage.repo'
import { ManuscriptStateService } from './manuscript-state.service'
import { ProductionStageStateService } from './production-stage-state.service'

@Injectable()
export class ManuscriptReviewService {
  constructor(
    private readonly chapterRepository: ChapterRepository,
    private readonly manuscriptStateService: ManuscriptStateService,
    private readonly notificationService: NotificationService,
    private readonly revisionService: RevisionService,
    @Optional() private readonly stageRepo?: ProductionStageRepository,
    @Optional() private readonly stageStateService?: ProductionStageStateService
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

  private async assertReadyForEditor(chapterId: string, mode: 'SUBMIT' | 'RESUBMIT'): Promise<boolean> {
    const pages = await this.chapterRepository.findPagesByChapterId(chapterId)
    if (pages.length === 0) throw NoPagesToSubmitException
    const stageCount = this.stageRepo ? await this.stageRepo.countByChapter(chapterId) : 0
    if (stageCount > 0) {
      if (mode === 'SUBMIT') {
        const finalCheck = await this.stageRepo!.findFinalCheck(chapterId)
        if (!finalCheck || finalCheck.status !== ProductionStageStatus.ACTIVE) throw ProductionNotFinalizedException
      } else {
        const stages = await this.stageRepo!.findByChapter(chapterId)
        if (stages.some((stage) => !stage.isFinalCheck && stage.status === ProductionStageStatus.ACTIVE)) {
          throw ProductionNotFinalizedException
        }
      }
      return true
    }
    const counts = await this.chapterRepository.countTasksByStatusForChapter(chapterId)
    const blocking = BLOCKING_TASK_STATUSES.reduce((sum, status) => sum + (counts[status] ?? 0), 0)
    if (blocking > 0) throw TasksNotAllApprovedException
    return false
  }

  async submit(userId: string, chapterId: string) {
    const { chapter, series } = await this.loadOwned(chapterId)
    if (series.mangakaId !== userId) throw NotSeriesOwnerException
    this.assertNotOnHold(chapter)
    await this.manuscriptStateService.assertCanTransition(chapterId, ManuscriptStatus.EDITOR_REVIEW)
    const stageMode = await this.assertReadyForEditor(chapterId, 'SUBMIT')

    const result = await this.manuscriptStateService.transitionWithPages(
      chapterId,
      ManuscriptStatus.EDITOR_REVIEW,
      { changedBy: userId },
      [PageStatus.DRAFT],
      PageStatus.COMPLETED
    )
    if (stageMode) await this.stageStateService?.markFinalCheckCompleted(chapterId)
    if (series.editorId) {
      await this.notificationService.notifySafe({
        recipientId: series.editorId,
        type: NotificationType.REVIEW,
        referenceId: chapterId,
        referenceType: 'MANUSCRIPT_SUBMITTED',
        content: ChapterMessages.notification.manuscriptSubmitted
      })
    }
    return { ...result, message: ChapterMessages.response.manuscriptSubmitted }
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
    return { ...result, message: ChapterMessages.response.manuscriptRevisionRequested }
  }

  async resubmit(userId: string, chapterId: string) {
    const { chapter, series } = await this.loadOwned(chapterId)
    if (series.mangakaId !== userId) throw NotSeriesOwnerException
    this.assertNotOnHold(chapter)
    await this.manuscriptStateService.assertCanTransition(chapterId, ManuscriptStatus.EDITOR_REVIEW)
    if (await this.revisionService.hasOpenRequest(RevisionTargetType.MANUSCRIPT, chapterId)) {
      throw RevisionNotResolvedException
    }
    const stageMode = await this.assertReadyForEditor(chapterId, 'RESUBMIT')

    const result = await this.manuscriptStateService.transitionWithPages(
      chapterId,
      ManuscriptStatus.EDITOR_REVIEW,
      { changedBy: userId },
      [PageStatus.REVISING, PageStatus.DRAFT],
      PageStatus.COMPLETED
    )
    if (stageMode) await this.stageStateService?.markFinalCheckCompleted(chapterId)
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
    return { ...result, message: ChapterMessages.response.manuscriptResubmitted }
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
    return { ...result, message: ChapterMessages.response.manuscriptApproved }
  }
}
