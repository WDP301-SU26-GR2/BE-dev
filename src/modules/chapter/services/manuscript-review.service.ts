import { Injectable } from '@nestjs/common'
import { ManuscriptStatus, NotificationType } from '@prisma/client'
import { NotificationService } from 'src/modules/notification/notification.service'
import {
  ChapterNotFoundException,
  ChapterOnHoldException,
  NotSeriesEditorException,
  NotSeriesOwnerException,
  PagesNotAllCompletedException
} from '../errors/chapter.errors'
import { ChapterRepository } from '../chapter.repo'
import { ManuscriptStateService } from './manuscript-state.service'
import { ChapterMessages } from '../chapter.messages'

@Injectable()
export class ManuscriptReviewService {
  constructor(
    private readonly chapterRepository: ChapterRepository,
    private readonly manuscriptStateService: ManuscriptStateService,
    private readonly notificationService: NotificationService
  ) {}

  private async loadOwned(userId: string, chapterId: string) {
    const chapter = await this.chapterRepository.findChapterById(chapterId)
    if (!chapter) throw ChapterNotFoundException
    const series = await this.chapterRepository.findSeriesById(chapter.seriesId)
    if (!series) throw ChapterNotFoundException
    return { chapter, series }
  }

  // PA-04: check hold SAU owner/editor check — người ngoài cuộc nhận 403, không lộ trạng thái hold (409).
  private assertNotOnHold(chapter: { hold: unknown }) {
    if (chapter.hold) throw ChapterOnHoldException
  }

  // A4-INTEGRATION: WIRED — IN_PRODUCTION→COMPOSITE_REVIEW auto khi mọi Task SUBMITTED (task-cascade.service).
  // Route manual này GIỮ làm fallback.
  async markCompositeReady(userId: string, chapterId: string) {
    const { chapter, series } = await this.loadOwned(userId, chapterId)
    if (series.mangakaId !== userId) throw NotSeriesOwnerException
    this.assertNotOnHold(chapter)
    return this.manuscriptStateService.transition(chapterId, ManuscriptStatus.COMPOSITE_REVIEW, { changedBy: userId })
  }

  // COMPOSITE_REVIEW→EDITOR_REVIEW — yêu cầu mọi Page = COMPLETED
  async submit(userId: string, chapterId: string) {
    const { chapter, series } = await this.loadOwned(userId, chapterId)
    if (series.mangakaId !== userId) throw NotSeriesOwnerException
    this.assertNotOnHold(chapter)
    const incomplete = await this.chapterRepository.countIncompletePages(chapterId)
    if (incomplete > 0) throw PagesNotAllCompletedException
    const res = await this.manuscriptStateService.transition(chapterId, ManuscriptStatus.EDITOR_REVIEW, {
      changedBy: userId
    })
    if (series.editorId) {
      await this.notificationService.notifySafe({
        recipientId: series.editorId,
        type: NotificationType.REVIEW,
        referenceId: chapterId,
        referenceType: 'MANUSCRIPT_SUBMITTED',
        content: ChapterMessages.notification.manuscriptSubmitted
      })
    }
    return res
  }

  // EDITOR_REVIEW→EDITOR_REVISION (annotation markup tạo riêng qua module annotation)
  async requestRevision(userId: string, chapterId: string, reason?: string) {
    const { chapter, series } = await this.loadOwned(userId, chapterId)
    if (series.editorId !== userId) throw NotSeriesEditorException
    this.assertNotOnHold(chapter)
    const res = await this.manuscriptStateService.transition(chapterId, ManuscriptStatus.EDITOR_REVISION, {
      changedBy: userId,
      reason
    })
    await this.notificationService.notifySafe({
      recipientId: series.mangakaId,
      type: NotificationType.REVIEW,
      referenceId: chapterId,
      referenceType: 'MANUSCRIPT_REVISION_REQUESTED',
      content: ChapterMessages.notification.editorRequestedRevision
    })
    return res
  }

  // EDITOR_REVISION→EDITOR_REVIEW
  async resubmit(userId: string, chapterId: string) {
    const { chapter, series } = await this.loadOwned(userId, chapterId)
    if (series.mangakaId !== userId) throw NotSeriesOwnerException
    this.assertNotOnHold(chapter)
    const res = await this.manuscriptStateService.transition(chapterId, ManuscriptStatus.EDITOR_REVIEW, {
      changedBy: userId
    })
    if (series.editorId) {
      await this.notificationService.notifySafe({
        recipientId: series.editorId,
        type: NotificationType.REVIEW,
        referenceId: chapterId,
        referenceType: 'MANUSCRIPT_RESUBMITTED',
        content: ChapterMessages.notification.manuscriptResubmitted
      })
    }
    return res
  }

  // EDITOR_REVIEW→READY_FOR_PRINT
  async approve(userId: string, chapterId: string) {
    const { chapter, series } = await this.loadOwned(userId, chapterId)
    if (series.editorId !== userId) throw NotSeriesEditorException
    this.assertNotOnHold(chapter)
    const res = await this.manuscriptStateService.transition(chapterId, ManuscriptStatus.READY_FOR_PRINT, {
      changedBy: userId
    })
    await this.notificationService.notifySafe({
      recipientId: series.mangakaId,
      type: NotificationType.REVIEW,
      referenceId: chapterId,
      referenceType: 'MANUSCRIPT_APPROVED',
      content: ChapterMessages.notification.manuscriptApproved
    })
    return res
  }
}
