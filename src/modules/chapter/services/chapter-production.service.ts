import { Injectable } from '@nestjs/common'
import { toPageRes } from '../chapter.mapper'
import { CreatePageBodyType, DeletePagesBulkBodyType, UpdatePageBodyType } from '../schemas/chapter-schemas'
import { ChapterCoOwnerService } from './chapter-coowner.service'
import { ChapterPublishService } from './chapter-publish.service'
import { ChapterQueryService } from './chapter-query.service'
import { ManuscriptReviewService } from './manuscript-review.service'
import { PageService } from './page.service'

@Injectable()
export class ChapterProductionService {
  constructor(
    private readonly pageService: PageService,
    private readonly reviewService: ManuscriptReviewService,
    private readonly publishService: ChapterPublishService,
    private readonly coOwnerService: ChapterCoOwnerService,
    private readonly queryService: ChapterQueryService
  ) {}

  async createPage(userId: string, chapterId: string, body: CreatePageBodyType) {
    return toPageRes(await this.pageService.createPage(userId, chapterId, body))
  }

  async listPages(userId: string, roleName: string, chapterId: string) {
    const pages = await this.pageService.listPages(userId, roleName, chapterId)
    return { items: pages.map(toPageRes) }
  }

  deletePage(userId: string, pageId: string) {
    return this.pageService.deletePage(userId, pageId)
  }

  deletePagesBulk(userId: string, chapterId: string, body: DeletePagesBulkBodyType) {
    return this.pageService.deletePagesBulk(userId, chapterId, body)
  }

  async updatePage(userId: string, pageId: string, body: UpdatePageBodyType) {
    return toPageRes((await this.pageService.updatePage(userId, pageId, body))!)
  }

  async submit(userId: string, chapterId: string) {
    await this.reviewService.submit(userId, chapterId)
    return this.queryService.getOne(chapterId)
  }

  async requestRevision(userId: string, chapterId: string, reason: string) {
    await this.reviewService.requestRevision(userId, chapterId, reason)
    return this.queryService.getOne(chapterId)
  }

  async resubmit(userId: string, chapterId: string) {
    await this.reviewService.resubmit(userId, chapterId)
    return this.queryService.getOne(chapterId)
  }

  async approve(userId: string, chapterId: string) {
    await this.reviewService.approve(userId, chapterId)
    return this.queryService.getOne(chapterId)
  }

  async publish(userId: string, chapterId: string) {
    await this.publishService.publish(userId, chapterId)
    return this.queryService.getOne(chapterId)
  }

  async coOwnerApprove(userId: string, chapterId: string) {
    await this.coOwnerService.approve(userId, chapterId)
    return this.queryService.getOne(chapterId)
  }

  async coOwnerReject(userId: string, chapterId: string, reason: string) {
    await this.coOwnerService.reject(userId, chapterId, reason)
    return this.queryService.getOne(chapterId)
  }
}
