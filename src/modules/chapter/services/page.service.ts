import { Injectable, Optional } from '@nestjs/common'
import { ManuscriptStatus, StoryboardStatus } from '@prisma/client'
import { PAGE_EDITABLE_STATUSES } from '../chapter.constant'
import { ChapterRepository } from '../chapter.repo'
import {
  ChapterStoryboardNotApprovedException,
  DuplicatePageNumberException,
  PageNotEditableException,
  PageNotFoundException
} from '../errors/chapter.errors'
import { ProductionPageSetLockedException, StageOutputInvalidException } from '../errors/production-stage.errors'
import { ProductionStageRepository } from '../production-stage.repo'
import { CreatePageBodyType, DeletePagesBulkBodyType, UpdatePageBodyType } from '../schemas/chapter-schemas'
import { ChapterPageAccessService } from './chapter-page-access.service'
import { ManuscriptStateService } from './manuscript-state.service'
import { PageCleanupService } from './page-cleanup.service'

@Injectable()
export class PageService {
  constructor(
    private readonly chapterRepository: ChapterRepository,
    private readonly manuscriptStateService: ManuscriptStateService,
    private readonly accessService: ChapterPageAccessService,
    private readonly cleanupService: PageCleanupService,
    @Optional() private readonly productionStageRepository?: ProductionStageRepository
  ) {}

  async createPage(userId: string, chapterId: string, body: CreatePageBodyType) {
    const chapter = await this.accessService.requireOwner(userId, chapterId)
    if (!chapter.storyboardId) throw ChapterStoryboardNotApprovedException
    const storyboardStatus = await this.chapterRepository.findStoryboardStatus(chapter.storyboardId)
    if (storyboardStatus !== StoryboardStatus.APPROVED) throw ChapterStoryboardNotApprovedException
    const stages = this.productionStageRepository ? await this.productionStageRepository.findByChapter(chapterId) : []
    const firstStage = stages[0]
    if (firstStage && firstStage.status !== 'ACTIVE') throw ProductionPageSetLockedException
    const page = firstStage
      ? await this.productionStageRepository!.createPageWithFirstStageInput(chapterId, {
          pageNumber: body.pageNumber,
          originalFile: body.originalFile
        })
      : await this.chapterRepository.createPage(chapterId, {
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
    await this.accessService.requireOwner(userId, page.chapterId)
    if (
      body.compositeFile != null &&
      this.productionStageRepository &&
      (await this.productionStageRepository.countByChapter(page.chapterId)) > 0
    ) {
      throw StageOutputInvalidException
    }
    if (!PAGE_EDITABLE_STATUSES.includes(page.status)) throw PageNotEditableException
    const data: { compositeFile?: string; pageNumber?: number } = {}
    if (body.compositeFile != null) data.compositeFile = body.compositeFile
    if (body.pageNumber != null) {
      const taken = await this.chapterRepository.findPageByChapterAndNumber(page.chapterId, body.pageNumber)
      if (taken && taken.id !== pageId) throw DuplicatePageNumberException
      data.pageNumber = body.pageNumber
    }
    if (Object.keys(data).length > 0) await this.chapterRepository.updatePage(pageId, data)
    return this.chapterRepository.findPageById(pageId)
  }

  deletePage(userId: string, pageId: string) {
    return this.cleanupService.deletePage(userId, pageId)
  }

  deletePagesBulk(userId: string, chapterId: string, body: DeletePagesBulkBodyType) {
    return this.cleanupService.deletePagesBulk(userId, chapterId, body)
  }

  async listPages(userId: string, roleName: string, chapterId: string) {
    await this.accessService.assertReadAccess(userId, roleName, chapterId)
    return this.chapterRepository.findPagesByChapterId(chapterId)
  }
}
