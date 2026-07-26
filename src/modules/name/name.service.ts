import { Injectable } from '@nestjs/common'
import { AddNamePageBodyType, CreateChapterNameBodyType, UpdateNamePagesBodyType } from './schemas/name-schemas'
import { NameContentService } from './services/name-content.service'
import { NameQueryService } from './services/name-query.service'
import { NameReviewService } from './services/name-review.service'

export type NameCaller = { userId: string; roleName: string }

/**
 * Compatibility application facade. Controllers and consumers keep the existing
 * NameService API while business rules live in focused use-case services.
 */
@Injectable()
export class NameService {
  constructor(
    private readonly reviewService: NameReviewService,
    private readonly contentService: NameContentService,
    private readonly queryService: NameQueryService
  ) {}

  listNames(caller: NameCaller, seriesId: string, page?: { limit: number; offset: number }) {
    return this.queryService.listNames(caller, seriesId, page)
  }

  getName(caller: NameCaller, seriesId: string, nameId: string) {
    return this.queryService.getName(caller, seriesId, nameId)
  }

  chapterListNames(caller: NameCaller, chapterId: string) {
    return this.queryService.chapterListNames(caller, chapterId)
  }

  chapterGetName(caller: NameCaller, chapterId: string, nameId: string) {
    return this.queryService.chapterGetName(caller, chapterId, nameId)
  }

  createChapterName(mangakaId: string, chapterId: string, body: CreateChapterNameBodyType) {
    return this.contentService.createChapterName(mangakaId, chapterId, body)
  }

  updatePages(mangakaId: string, seriesId: string, nameId: string, body: UpdateNamePagesBodyType) {
    return this.contentService.updatePages(mangakaId, seriesId, nameId, body)
  }

  addPage(mangakaId: string, seriesId: string, nameId: string, page: AddNamePageBodyType) {
    return this.contentService.addPage(mangakaId, seriesId, nameId, page)
  }

  chapterSubmit(mangakaId: string, chapterId: string, nameId: string) {
    return this.contentService.chapterSubmit(mangakaId, chapterId, nameId)
  }

  chapterUpdatePages(mangakaId: string, chapterId: string, nameId: string, body: UpdateNamePagesBodyType) {
    return this.contentService.chapterUpdatePages(mangakaId, chapterId, nameId, body)
  }

  chapterAddPage(mangakaId: string, chapterId: string, nameId: string, page: AddNamePageBodyType) {
    return this.contentService.chapterAddPage(mangakaId, chapterId, nameId, page)
  }

  deleteChapterName(mangakaId: string, chapterId: string, nameId: string) {
    return this.contentService.deleteChapterName(mangakaId, chapterId, nameId)
  }

  requestRevision(editorId: string, seriesId: string, nameId: string, reason: string) {
    return this.reviewService.requestRevision(editorId, seriesId, nameId, reason)
  }

  resubmit(mangakaId: string, seriesId: string, nameId: string) {
    return this.reviewService.resubmit(mangakaId, seriesId, nameId)
  }

  approve(editorId: string, seriesId: string, nameId: string) {
    return this.reviewService.approve(editorId, seriesId, nameId)
  }

  chapterRequestRevision(editorId: string, chapterId: string, nameId: string, reason: string) {
    return this.reviewService.chapterRequestRevision(editorId, chapterId, nameId, reason)
  }

  chapterResubmit(mangakaId: string, chapterId: string, nameId: string) {
    return this.reviewService.chapterResubmit(mangakaId, chapterId, nameId)
  }

  chapterApprove(editorId: string, chapterId: string, nameId: string) {
    return this.reviewService.chapterApprove(editorId, chapterId, nameId)
  }
}
