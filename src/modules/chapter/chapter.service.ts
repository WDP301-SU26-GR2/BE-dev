import { Injectable } from '@nestjs/common'
import {
  CreateChapterBodyType,
  CreatePageBodyType,
  DeletePagesBulkBodyType,
  ExtendDeadlineBodyType,
  HoldChapterBodyType,
  SetScheduleBodyType,
  UpdateChapterBodyType,
  UpdatePageBodyType
} from './schemas/chapter-schemas'
import { ChapterPlanningService } from './services/chapter-planning.service'
import { ChapterProductionService } from './services/chapter-production.service'
import { ChapterQueryService } from './services/chapter-query.service'

@Injectable()
export class ChapterService {
  constructor(
    private readonly planningService: ChapterPlanningService,
    private readonly productionService: ChapterProductionService,
    private readonly queryService: ChapterQueryService
  ) {}

  create(userId: string, body: CreateChapterBodyType) {
    return this.planningService.create(userId, body)
  }
  updateChapter(userId: string, chapterId: string, body: UpdateChapterBodyType) {
    return this.planningService.updateChapter(userId, chapterId, body)
  }
  deleteChapter(userId: string, id: string) {
    return this.planningService.deleteChapter(userId, id)
  }
  getOne(user: { userId: string; roleName: string }, chapterId: string) {
    return this.queryService.getOne(user, chapterId)
  }
  listBySeries(user: { userId: string; roleName: string }, seriesId: string) {
    return this.queryService.listBySeries(user, seriesId)
  }
  setSchedule(userId: string, chapterId: string, body: SetScheduleBodyType) {
    return this.planningService.setSchedule(userId, chapterId, body)
  }
  extendDeadline(userId: string, chapterId: string, body: ExtendDeadlineBodyType) {
    return this.planningService.extendDeadline(userId, chapterId, body)
  }
  progress(user: { userId: string; roleName: string }, chapterId: string) {
    return this.queryService.progress(user, chapterId)
  }
  studioOverview(userId: string) {
    return this.queryService.studioOverview(userId)
  }
  hold(userId: string, chapterId: string, body: HoldChapterBodyType) {
    return this.planningService.hold(userId, chapterId, body)
  }
  resume(userId: string, chapterId: string) {
    return this.planningService.resume(userId, chapterId)
  }
  createPage(userId: string, chapterId: string, body: CreatePageBodyType) {
    return this.productionService.createPage(userId, chapterId, body)
  }
  listPages(userId: string, roleName: string, chapterId: string) {
    return this.productionService.listPages(userId, roleName, chapterId)
  }
  deletePage(userId: string, pageId: string) {
    return this.productionService.deletePage(userId, pageId)
  }
  deletePagesBulk(userId: string, chapterId: string, body: DeletePagesBulkBodyType) {
    return this.productionService.deletePagesBulk(userId, chapterId, body)
  }
  updatePage(userId: string, pageId: string, body: UpdatePageBodyType) {
    return this.productionService.updatePage(userId, pageId, body)
  }
  submit(userId: string, chapterId: string) {
    return this.productionService.submit(userId, chapterId)
  }
  requestRevision(userId: string, chapterId: string, reason: string) {
    return this.productionService.requestRevision(userId, chapterId, reason)
  }
  resubmit(userId: string, chapterId: string) {
    return this.productionService.resubmit(userId, chapterId)
  }
  approve(userId: string, chapterId: string) {
    return this.productionService.approve(userId, chapterId)
  }
  publish(userId: string, chapterId: string) {
    return this.productionService.publish(userId, chapterId)
  }
  coOwnerApprove(userId: string, chapterId: string) {
    return this.productionService.coOwnerApprove(userId, chapterId)
  }
  coOwnerReject(userId: string, chapterId: string, reason: string) {
    return this.productionService.coOwnerReject(userId, chapterId, reason)
  }
}
