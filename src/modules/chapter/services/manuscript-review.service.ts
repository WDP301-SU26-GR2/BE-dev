import { Injectable } from '@nestjs/common'
import { ManuscriptStatus, NotificationType } from '@prisma/client'
import { NotificationService } from 'src/modules/notification/notification.service'
import {
  ChapterNotFoundException,
  NotSeriesEditorException,
  NotSeriesOwnerException,
  PagesNotAllCompletedException
} from '../errors/chapter.errors'
import { ChapterRepository } from '../chapter.repo'
import { ManuscriptStateService } from './manuscript-state.service'

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

  // IN_PRODUCTION→COMPOSITE_REVIEW (manual; A4 auto khi mọi Task SUBMITTED — // A4-INTEGRATION)
  async markCompositeReady(userId: string, chapterId: string) {
    const { series } = await this.loadOwned(userId, chapterId)
    if (series.mangakaId !== userId) throw NotSeriesOwnerException
    return this.manuscriptStateService.transition(chapterId, ManuscriptStatus.COMPOSITE_REVIEW, { changedBy: userId })
  }

  // COMPOSITE_REVIEW→EDITOR_REVIEW — yêu cầu mọi Page = COMPLETED
  async submit(userId: string, chapterId: string) {
    const { series } = await this.loadOwned(userId, chapterId)
    if (series.mangakaId !== userId) throw NotSeriesOwnerException
    const incomplete = await this.chapterRepository.countIncompletePages(chapterId)
    if (incomplete > 0) throw PagesNotAllCompletedException
    const res = await this.manuscriptStateService.transition(chapterId, ManuscriptStatus.EDITOR_REVIEW, {
      changedBy: userId
    })
    if (series.editorId) {
      await this.notificationService.notify({
        recipientId: series.editorId,
        type: NotificationType.REVIEW,
        referenceId: chapterId,
        referenceType: 'CHAPTER',
        content: 'Manuscript submitted for review'
      })
    }
    return res
  }

  // EDITOR_REVIEW→EDITOR_REVISION (annotation markup tạo riêng qua module annotation)
  async requestRevision(userId: string, chapterId: string, reason?: string) {
    const { series } = await this.loadOwned(userId, chapterId)
    if (series.editorId !== userId) throw NotSeriesEditorException
    const res = await this.manuscriptStateService.transition(chapterId, ManuscriptStatus.EDITOR_REVISION, {
      changedBy: userId,
      reason
    })
    await this.notificationService.notify({
      recipientId: series.mangakaId,
      type: NotificationType.REVIEW,
      referenceId: chapterId,
      referenceType: 'CHAPTER',
      content: 'Editor requested revision'
    })
    return res
  }

  // EDITOR_REVISION→EDITOR_REVIEW
  async resubmit(userId: string, chapterId: string) {
    const { series } = await this.loadOwned(userId, chapterId)
    if (series.mangakaId !== userId) throw NotSeriesOwnerException
    const res = await this.manuscriptStateService.transition(chapterId, ManuscriptStatus.EDITOR_REVIEW, {
      changedBy: userId
    })
    if (series.editorId) {
      await this.notificationService.notify({
        recipientId: series.editorId,
        type: NotificationType.REVIEW,
        referenceId: chapterId,
        referenceType: 'CHAPTER',
        content: 'Manuscript resubmitted'
      })
    }
    return res
  }

  // EDITOR_REVIEW→READY_FOR_PRINT
  async approve(userId: string, chapterId: string) {
    const { series } = await this.loadOwned(userId, chapterId)
    if (series.editorId !== userId) throw NotSeriesEditorException
    const res = await this.manuscriptStateService.transition(chapterId, ManuscriptStatus.READY_FOR_PRINT, {
      changedBy: userId
    })
    await this.notificationService.notify({
      recipientId: series.mangakaId,
      type: NotificationType.REVIEW,
      referenceId: chapterId,
      referenceType: 'CHAPTER',
      content: 'Manuscript approved (ready for print)'
    })
    return res
  }
}
