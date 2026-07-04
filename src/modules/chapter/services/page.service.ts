import { Injectable } from '@nestjs/common'
import { ManuscriptStatus } from '@prisma/client'
import {
  ChapterNotFoundException,
  ChapterOnHoldException,
  NotSeriesOwnerException,
  PageNotFoundException
} from '../errors/chapter.errors'
import { ChapterRepository } from '../chapter.repo'
import { CreatePageBodyType, UpdatePageBodyType } from '../schemas/chapter-schemas'
import { ManuscriptStateService } from './manuscript-state.service'
import { PageStateService } from './page-state.service'

@Injectable()
export class PageService {
  constructor(
    private readonly chapterRepository: ChapterRepository,
    private readonly manuscriptStateService: ManuscriptStateService,
    private readonly pageStateService: PageStateService
  ) {}

  private async requireOwner(userId: string, chapterId: string) {
    const chapter = await this.chapterRepository.findChapterById(chapterId)
    if (!chapter) throw ChapterNotFoundException
    const series = await this.chapterRepository.findSeriesById(chapter.seriesId)
    if (!series || series.mangakaId !== userId) throw NotSeriesOwnerException
    if (chapter.hold) throw ChapterOnHoldException
    return chapter
  }

  // A-CHP-03: tạo Page. Page đầu tiên (Manuscript=DRAFT) → DRAFT→IN_PRODUCTION (Mangaka bắt đầu vẽ).
  async createPage(userId: string, chapterId: string, body: CreatePageBodyType) {
    await this.requireOwner(userId, chapterId)
    const page = await this.chapterRepository.createPage(chapterId, {
      pageNumber: body.pageNumber,
      originalFile: body.originalFile
    })
    const manuscript = await this.chapterRepository.findManuscriptByChapterId(chapterId)
    if (manuscript?.status === ManuscriptStatus.DRAFT) {
      await this.manuscriptStateService.transition(chapterId, ManuscriptStatus.IN_PRODUCTION, { changedBy: userId })
    }
    return page
  }

  async updatePage(userId: string, pageId: string, body: UpdatePageBodyType) {
    const page = await this.chapterRepository.findPageById(pageId)
    if (!page) throw PageNotFoundException
    await this.requireOwner(userId, page.chapterId)
    if (body.compositeFile !== undefined) {
      await this.chapterRepository.updatePage(pageId, { compositeFile: body.compositeFile })
    }
    if (body.status !== undefined) {
      return this.pageStateService.transition(pageId, body.status)
    }
    return this.chapterRepository.findPageById(pageId)
  }

  async listPages(chapterId: string) {
    return this.chapterRepository.findPagesByChapterId(chapterId)
  }
}
