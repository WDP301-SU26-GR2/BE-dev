import { Injectable } from '@nestjs/common'
import { NotificationType, StoryboardStatus, SeriesStatus } from '@prisma/client'
import { isObjectId } from 'src/core/http/schemas/object-id.schema'
import { NotificationService } from 'src/modules/notification/notification.service'
import {
  ChapterStoryboardAlreadyExistsException,
  ChapterNotDraftForStoryboardException,
  ChapterNotFoundException,
  InvalidStoryboardStateException,
  StoryboardNotDeletableException,
  StoryboardNotFoundException,
  NotSeriesOwnerException,
  SeriesNotSerializedException
} from '../errors/storyboard.errors'
import { toStoryboardRes } from '../storyboard.mapper'
import { StoryboardMessages } from '../storyboard.messages'
import { StoryboardRepo } from '../storyboard.repo'
import {
  AddStoryboardPageBodyType,
  CreateChapterStoryboardBodyType,
  UpdateStoryboardPagesBodyType
} from '../schemas/storyboard-schemas'
import { StoryboardAccessService, StoryboardScope } from './storyboard-access.service'

const CHAPTER_CREATABLE_STATUSES: SeriesStatus[] = [
  SeriesStatus.SERIALIZED,
  SeriesStatus.CANCELLING,
  SeriesStatus.COMPLETING
]

@Injectable()
export class StoryboardContentService {
  constructor(
    private readonly access: StoryboardAccessService,
    private readonly repository: StoryboardRepo,
    private readonly notificationService: NotificationService
  ) {}

  async createChapterStoryboard(mangakaId: string, chapterId: string, body: CreateChapterStoryboardBodyType) {
    if (!isObjectId(chapterId)) throw ChapterNotFoundException
    const chapter = await this.repository.findChapterForStoryboardGuard(chapterId)
    if (!chapter) throw ChapterNotFoundException
    if (chapter.series?.mangakaId !== mangakaId) throw NotSeriesOwnerException
    if (chapter.status !== 'DRAFT') throw ChapterNotDraftForStoryboardException
    if (!chapter.series?.status || !CHAPTER_CREATABLE_STATUSES.includes(chapter.series.status)) {
      throw SeriesNotSerializedException
    }
    if (chapter.storyboardId) throw ChapterStoryboardAlreadyExistsException
    const created = await this.repository.createChapterStoryboardForChapter({
      chapterId,
      seriesId: chapter.seriesId,
      storyboardPages: body.storyboardPages
    })
    return toStoryboardRes(created)
  }

  async chapterUpdatePages(
    mangakaId: string,
    chapterId: string,
    storyboardId: string,
    body: UpdateStoryboardPagesBodyType
  ) {
    const seriesId = await this.access.chapterSeriesId(chapterId)
    return this.doUpdatePages(mangakaId, seriesId, storyboardId, body, { chapterId })
  }

  private async doUpdatePages(
    mangakaId: string,
    seriesId: string,
    storyboardId: string,
    body: UpdateStoryboardPagesBodyType,
    scope: StoryboardScope
  ) {
    const { storyboard } = await this.access.requireOwnerStoryboard(seriesId, mangakaId, storyboardId, scope)
    this.requireEditable(storyboard.status)
    return toStoryboardRes(await this.repository.updateStoryboardPages(storyboardId, body.pages))
  }

  async chapterAddPage(mangakaId: string, chapterId: string, storyboardId: string, page: AddStoryboardPageBodyType) {
    const seriesId = await this.access.chapterSeriesId(chapterId)
    return this.doAddPage(mangakaId, seriesId, storyboardId, page, { chapterId })
  }

  private async doAddPage(
    mangakaId: string,
    seriesId: string,
    storyboardId: string,
    page: AddStoryboardPageBodyType,
    scope: StoryboardScope
  ) {
    const { storyboard } = await this.access.requireOwnerStoryboard(seriesId, mangakaId, storyboardId, scope)
    this.requireEditable(storyboard.status)
    return toStoryboardRes(await this.repository.appendStoryboardPage(storyboardId, page))
  }

  async chapterSubmit(mangakaId: string, chapterId: string, storyboardId: string) {
    const seriesId = await this.access.chapterSeriesId(chapterId)
    const { series, storyboard } = await this.access.requireOwnerStoryboard(seriesId, mangakaId, storyboardId, {
      chapterId
    })
    if (storyboard.status !== StoryboardStatus.DRAFT) throw InvalidStoryboardStateException
    const updated = await this.repository.updateStoryboardStatus(storyboardId, {
      status: StoryboardStatus.SUBMITTED,
      submittedAt: new Date()
    })
    // Notify Editor when storyboard is submitted
    if (series.editorId) {
      await this.notificationService.notifySafe({
        recipientId: series.editorId,
        type: NotificationType.REVIEW,
        referenceId: storyboardId,
        referenceType: 'STORYBOARD_SUBMITTED',
        content: StoryboardMessages.notification.storyboardSubmitted
      })
    }
    return { ...toStoryboardRes(updated), message: StoryboardMessages.response.storyboardSubmitted }
  }

  async deleteChapterStoryboard(mangakaId: string, chapterId: string, storyboardId: string) {
    if (!isObjectId(chapterId)) throw ChapterNotFoundException
    const chapter = await this.repository.findChapterForStoryboardGuard(chapterId)
    if (!chapter) throw ChapterNotFoundException
    if (chapter.series?.mangakaId !== mangakaId) throw NotSeriesOwnerException
    if (!isObjectId(storyboardId)) throw StoryboardNotFoundException
    const storyboard = await this.repository.findStoryboardById(storyboardId)
    if (!storyboard || storyboard.chapterId !== chapterId) throw StoryboardNotFoundException
    if (chapter.status !== 'DRAFT' || storyboard.status === StoryboardStatus.APPROVED)
      throw StoryboardNotDeletableException
    await this.repository.deleteChapterStoryboard(chapterId, storyboardId)
    return { message: StoryboardMessages.response.chapterStoryboardDeleted }
  }

  private requireEditable(status: StoryboardStatus) {
    if (status !== StoryboardStatus.DRAFT && status !== StoryboardStatus.REVISION) {
      throw InvalidStoryboardStateException
    }
  }
}
