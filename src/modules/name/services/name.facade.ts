import { Injectable } from '@nestjs/common'
import { AddNamePageBodyType, CreateChapterNameBodyType, UpdateNamePagesBodyType } from '../schemas/name-schemas'
import { NameCaller, NameService } from '../name.service'
import { NameQueryService } from './name-query.service'

@Injectable()
export class NameFacade {
  constructor(
    private readonly queryService: NameQueryService,
    private readonly workflowService: NameService
  ) {}

  listNames(caller: NameCaller, seriesId: string, page?: { limit: number; offset: number }) {
    return this.queryService.listNames(caller, seriesId, page)
  }

  getName(caller: NameCaller, seriesId: string, nameId: string) {
    return this.queryService.getName(caller, seriesId, nameId)
  }

  createChapterName(mangakaId: string, chapterId: string, body: CreateChapterNameBodyType) {
    return this.workflowService.createChapterName(mangakaId, chapterId, body)
  }

  requestRevision(editorId: string, seriesId: string, nameId: string, reason: string) {
    return this.workflowService.requestRevision(editorId, seriesId, nameId, reason)
  }

  resubmit(mangakaId: string, seriesId: string, nameId: string) {
    return this.workflowService.resubmit(mangakaId, seriesId, nameId)
  }

  approve(editorId: string, seriesId: string, nameId: string) {
    return this.workflowService.approve(editorId, seriesId, nameId)
  }

  updatePages(mangakaId: string, seriesId: string, nameId: string, body: UpdateNamePagesBodyType) {
    return this.workflowService.updatePages(mangakaId, seriesId, nameId, body)
  }

  addPage(mangakaId: string, seriesId: string, nameId: string, body: AddNamePageBodyType) {
    return this.workflowService.addPage(mangakaId, seriesId, nameId, body)
  }

  chapterSubmit(mangakaId: string, chapterId: string, nameId: string) {
    return this.workflowService.chapterSubmit(mangakaId, chapterId, nameId)
  }

  chapterListNames(caller: NameCaller, chapterId: string) {
    return this.queryService.chapterListNames(caller, chapterId)
  }

  chapterGetName(caller: NameCaller, chapterId: string, nameId: string) {
    return this.queryService.chapterGetName(caller, chapterId, nameId)
  }

  chapterRequestRevision(editorId: string, chapterId: string, nameId: string, reason: string) {
    return this.workflowService.chapterRequestRevision(editorId, chapterId, nameId, reason)
  }

  chapterResubmit(mangakaId: string, chapterId: string, nameId: string) {
    return this.workflowService.chapterResubmit(mangakaId, chapterId, nameId)
  }

  chapterApprove(editorId: string, chapterId: string, nameId: string) {
    return this.workflowService.chapterApprove(editorId, chapterId, nameId)
  }

  chapterUpdatePages(mangakaId: string, chapterId: string, nameId: string, body: UpdateNamePagesBodyType) {
    return this.workflowService.chapterUpdatePages(mangakaId, chapterId, nameId, body)
  }

  chapterAddPage(mangakaId: string, chapterId: string, nameId: string, body: AddNamePageBodyType) {
    return this.workflowService.chapterAddPage(mangakaId, chapterId, nameId, body)
  }

  deleteChapterName(mangakaId: string, chapterId: string, nameId: string) {
    return this.workflowService.deleteChapterName(mangakaId, chapterId, nameId)
  }
}
