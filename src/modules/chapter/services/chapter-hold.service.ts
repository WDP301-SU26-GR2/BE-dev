import { Injectable } from '@nestjs/common'
import { ManuscriptStatus, NotificationType } from '@prisma/client'
import { NotificationService } from 'src/modules/notification/notification.service'
import { toChapterRes } from '../chapter.mapper'
import { ChapterRepository } from '../chapter.repo'
import { ChapterMessages } from '../chapter.messages'
import {
  ChapterAlreadyOnHoldException,
  ChapterNotFoundException,
  ChapterNotHoldableException,
  ChapterNotOnHoldException,
  NotSeriesEditorException
} from '../errors/chapter.errors'
import { HoldChapterBodyType } from '../schemas/chapter-schemas'

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/

const HOLDABLE_MANUSCRIPT_STATUSES: ManuscriptStatus[] = [
  ManuscriptStatus.IN_PRODUCTION,
  ManuscriptStatus.COMPOSITE_REVIEW,
  ManuscriptStatus.EDITOR_REVIEW,
  ManuscriptStatus.EDITOR_REVISION,
  ManuscriptStatus.READY_FOR_PRINT
]

@Injectable()
export class ChapterHoldService {
  constructor(
    private readonly chapterRepository: ChapterRepository,
    private readonly notificationService: NotificationService
  ) {}

  private async requireEditorChapter(editorId: string, chapterId: string) {
    if (!OBJECT_ID_RE.test(chapterId)) throw ChapterNotFoundException
    const chapter = await this.chapterRepository.findChapterById(chapterId)
    if (!chapter) throw ChapterNotFoundException
    const series = await this.chapterRepository.findSeriesById(chapter.seriesId)
    if (!series || series.editorId !== editorId) throw NotSeriesEditorException
    return { chapter, series }
  }

  async hold(editorId: string, chapterId: string, body: HoldChapterBodyType) {
    const { chapter, series } = await this.requireEditorChapter(editorId, chapterId)
    if (chapter.hold) throw ChapterAlreadyOnHoldException
    const manuscript = await this.chapterRepository.findManuscriptByChapterId(chapterId)
    if (!manuscript || !HOLDABLE_MANUSCRIPT_STATUSES.includes(manuscript.status)) throw ChapterNotHoldableException
    const updated = await this.chapterRepository.setChapterHold(chapterId, {
      reason: body.reason,
      expectedReturnDate: body.expectedReturnDate ? new Date(body.expectedReturnDate) : null,
      heldBy: editorId
    })
    await this.notificationService.notifySafe({
      recipientId: series.mangakaId,
      type: NotificationType.SYSTEM,
      referenceId: chapterId,
      referenceType: 'CHAPTER_HELD',
      content: ChapterMessages.notification.chapterHeld(body.reason)
    })
    return toChapterRes(updated)
  }

  async resume(editorId: string, chapterId: string) {
    const { chapter, series } = await this.requireEditorChapter(editorId, chapterId)
    if (!chapter.hold) throw ChapterNotOnHoldException
    const updated = await this.chapterRepository.unsetChapterHold(chapterId, editorId)
    await this.notificationService.notifySafe({
      recipientId: series.mangakaId,
      type: NotificationType.SYSTEM,
      referenceId: chapterId,
      referenceType: 'CHAPTER_RESUMED',
      content: ChapterMessages.notification.chapterResumed
    })
    return toChapterRes(updated)
  }
}
