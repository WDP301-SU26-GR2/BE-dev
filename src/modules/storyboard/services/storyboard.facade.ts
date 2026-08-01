import { Injectable } from '@nestjs/common'
import {
  AddStoryboardPageBodyType,
  CreateChapterStoryboardBodyType,
  UpdateStoryboardPagesBodyType
} from '../schemas/storyboard-schemas'
import { StoryboardCaller, StoryboardService } from '../storyboard.service'
import { StoryboardQueryService } from './storyboard-query.service'

// Spec 28: Storyboard giờ chỉ phục vụ CHƯƠNG — facade chỉ còn chapter-scoped method.
// Series-scoped (proposal) đã xoá cùng StoryboardController; series module tự xử lý proposal inline.
@Injectable()
export class StoryboardFacade {
  constructor(
    private readonly queryService: StoryboardQueryService,
    private readonly workflowService: StoryboardService
  ) {}

  createChapterStoryboard(mangakaId: string, chapterId: string, body: CreateChapterStoryboardBodyType) {
    return this.workflowService.createChapterStoryboard(mangakaId, chapterId, body)
  }

  chapterSubmit(mangakaId: string, chapterId: string, storyboardId: string) {
    return this.workflowService.chapterSubmit(mangakaId, chapterId, storyboardId)
  }

  chapterListStoryboards(caller: StoryboardCaller, chapterId: string) {
    return this.queryService.chapterListStoryboards(caller, chapterId)
  }

  chapterGetStoryboard(caller: StoryboardCaller, chapterId: string, storyboardId: string) {
    return this.queryService.chapterGetStoryboard(caller, chapterId, storyboardId)
  }

  chapterRequestRevision(editorId: string, chapterId: string, storyboardId: string, reason: string) {
    return this.workflowService.chapterRequestRevision(editorId, chapterId, storyboardId, reason)
  }

  chapterResubmit(mangakaId: string, chapterId: string, storyboardId: string) {
    return this.workflowService.chapterResubmit(mangakaId, chapterId, storyboardId)
  }

  chapterApprove(editorId: string, chapterId: string, storyboardId: string) {
    return this.workflowService.chapterApprove(editorId, chapterId, storyboardId)
  }

  chapterUpdatePages(mangakaId: string, chapterId: string, storyboardId: string, body: UpdateStoryboardPagesBodyType) {
    return this.workflowService.chapterUpdatePages(mangakaId, chapterId, storyboardId, body)
  }

  chapterAddPage(mangakaId: string, chapterId: string, storyboardId: string, body: AddStoryboardPageBodyType) {
    return this.workflowService.chapterAddPage(mangakaId, chapterId, storyboardId, body)
  }

  deleteChapterStoryboard(mangakaId: string, chapterId: string, storyboardId: string) {
    return this.workflowService.deleteChapterStoryboard(mangakaId, chapterId, storyboardId)
  }
}
