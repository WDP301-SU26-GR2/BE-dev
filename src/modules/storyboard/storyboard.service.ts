import { Injectable } from '@nestjs/common'
import {
  AddStoryboardPageBodyType,
  CreateChapterStoryboardBodyType,
  UpdateStoryboardPagesBodyType
} from './schemas/storyboard-schemas'
import { StoryboardContentService } from './services/storyboard-content.service'
import { StoryboardQueryService } from './services/storyboard-query.service'
import { StoryboardReviewService } from './services/storyboard-review.service'

export type StoryboardCaller = { userId: string; roleName: string }

/**
 * Spec 28: Compatibility application facade. Chỉ còn chapter-scoped method.
 */
@Injectable()
export class StoryboardService {
  constructor(
    private readonly reviewService: StoryboardReviewService,
    private readonly contentService: StoryboardContentService,
    private readonly queryService: StoryboardQueryService
  ) {}

  chapterListStoryboards(caller: StoryboardCaller, chapterId: string) {
    return this.queryService.chapterListStoryboards(caller, chapterId)
  }

  chapterGetStoryboard(caller: StoryboardCaller, chapterId: string, storyboardId: string) {
    return this.queryService.chapterGetStoryboard(caller, chapterId, storyboardId)
  }

  createChapterStoryboard(mangakaId: string, chapterId: string, body: CreateChapterStoryboardBodyType) {
    return this.contentService.createChapterStoryboard(mangakaId, chapterId, body)
  }

  chapterSubmit(mangakaId: string, chapterId: string, storyboardId: string) {
    return this.contentService.chapterSubmit(mangakaId, chapterId, storyboardId)
  }

  chapterUpdatePages(mangakaId: string, chapterId: string, storyboardId: string, body: UpdateStoryboardPagesBodyType) {
    return this.contentService.chapterUpdatePages(mangakaId, chapterId, storyboardId, body)
  }

  chapterAddPage(mangakaId: string, chapterId: string, storyboardId: string, page: AddStoryboardPageBodyType) {
    return this.contentService.chapterAddPage(mangakaId, chapterId, storyboardId, page)
  }

  deleteChapterStoryboard(mangakaId: string, chapterId: string, storyboardId: string) {
    return this.contentService.deleteChapterStoryboard(mangakaId, chapterId, storyboardId)
  }

  chapterRequestRevision(editorId: string, chapterId: string, storyboardId: string, reason: string) {
    return this.reviewService.chapterRequestRevision(editorId, chapterId, storyboardId, reason)
  }

  chapterResubmit(mangakaId: string, chapterId: string, storyboardId: string) {
    return this.reviewService.chapterResubmit(mangakaId, chapterId, storyboardId)
  }

  chapterApprove(editorId: string, chapterId: string, storyboardId: string) {
    return this.reviewService.chapterApprove(editorId, chapterId, storyboardId)
  }
}
