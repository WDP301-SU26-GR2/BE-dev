import { Injectable } from '@nestjs/common'
import {
  BoardApproveReprintBodyDto,
  CreateReprintRequestBodyDto,
  EditorApproveChapterBodyDto,
  MangakaReviewReprintBodyDto,
  SubmitChapterManuscriptBodyDto
} from '../dto/reprint-request.dto'
import { AssignReviserBodyType } from '../schemas/reprint-request-schema'
import { ActorContext } from './reprint-access.policy'
import { ReprintChapterService } from './reprint-chapter.service'
import { ReprintQueryService } from './reprint-query.service'
import { ReprintWorkflowService } from './reprint-workflow.service'

@Injectable()
export class ReprintRequestFacade {
  constructor(
    private readonly queryService: ReprintQueryService,
    private readonly chapterService: ReprintChapterService,
    private readonly workflowService: ReprintWorkflowService
  ) {}

  findAll(userId: string, roleName: string, filters: { status?: string; seriesId?: string }) {
    return this.queryService.findAll(userId, roleName, filters)
  }

  findById(id: string, actor: ActorContext) {
    return this.queryService.findById(id, actor)
  }

  getChapters(id: string, actor: ActorContext) {
    return this.queryService.getChapters(id, actor)
  }

  getChapterById(id: string, chapterId: string, actor: ActorContext) {
    return this.queryService.getChapterById(id, chapterId, actor)
  }

  updateChapterManuscript(
    id: string,
    chapterId: string,
    dto: SubmitChapterManuscriptBodyDto,
    actor: ActorContext | string
  ) {
    return this.chapterService.updateChapterManuscript(id, chapterId, dto, actor)
  }

  approveChapter(id: string, chapterId: string, dto: EditorApproveChapterBodyDto, actor: ActorContext | string) {
    return this.chapterService.approveChapter(id, chapterId, dto, actor)
  }

  create(actor: ActorContext | string, dto: CreateReprintRequestBodyDto) {
    return this.workflowService.create(actor, dto)
  }

  mangakaReview(id: string, dto: MangakaReviewReprintBodyDto, actor: ActorContext | string) {
    return this.workflowService.mangakaReview(id, dto, actor)
  }

  boardApprove(id: string, dto: BoardApproveReprintBodyDto, actor: ActorContext | string) {
    return this.workflowService.boardApprove(id, dto, actor)
  }

  assignReviser(id: string, chapterId: string, dto: AssignReviserBodyType, actor: ActorContext | string) {
    return this.workflowService.assignReviser(id, chapterId, dto, actor)
  }
}
