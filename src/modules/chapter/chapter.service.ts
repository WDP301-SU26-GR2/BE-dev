import { Injectable } from '@nestjs/common'
import { toChapterRes, toPageRes } from './chapter.mapper'
import { ChapterRepository } from './chapter.repo'
import {
  CreateChapterBodyType,
  CreatePageBodyType,
  ExtendDeadlineBodyType,
  HoldChapterBodyType,
  SetScheduleBodyType,
  UpdatePageBodyType
} from './schemas/chapter-schemas'
import { ChapterCreationService } from './services/chapter-creation.service'
import { ChapterHoldService } from './services/chapter-hold.service'
import { ChapterPublishService } from './services/chapter-publish.service'
import { ChapterCoOwnerService } from './services/chapter-coowner.service'
import { ChapterProgressService } from './services/chapter-progress.service'
import { ManuscriptReviewService } from './services/manuscript-review.service'
import { PageService } from './services/page.service'
import { ScheduleService } from './services/schedule.service'
import { ChapterNotFoundException } from './errors/chapter.errors'

@Injectable()
export class ChapterService {
  constructor(
    private readonly creationService: ChapterCreationService,
    private readonly scheduleService: ScheduleService,
    private readonly holdService: ChapterHoldService,
    private readonly pageService: PageService,
    private readonly reviewService: ManuscriptReviewService,
    private readonly publishService: ChapterPublishService,
    private readonly coOwnerService: ChapterCoOwnerService,
    private readonly progressService: ChapterProgressService,
    private readonly chapterRepository: ChapterRepository
  ) {}

  async create(userId: string, body: CreateChapterBodyType) {
    const chapter = await this.creationService.create(userId, body)
    return toChapterRes(chapter!)
  }

  async getOne(chapterId: string) {
    const chapter = await this.chapterRepository.findChapterWithRelations(chapterId)
    if (!chapter) throw ChapterNotFoundException
    return toChapterRes(chapter)
  }

  async listBySeries(seriesId: string) {
    const chapters = await this.chapterRepository.findChaptersBySeriesId(seriesId)
    return { items: chapters.map(toChapterRes) }
  }

  async setSchedule(userId: string, chapterId: string, body: SetScheduleBodyType) {
    await this.scheduleService.setSchedule(userId, chapterId, body)
    return this.getOne(chapterId)
  }

  async extendDeadline(userId: string, chapterId: string, body: ExtendDeadlineBodyType) {
    await this.scheduleService.extendDeadline(userId, chapterId, body)
    return this.getOne(chapterId)
  }

  progress(user: { userId: string; roleName: string }, chapterId: string) {
    return this.progressService.getProgress(user, chapterId)
  }

  studioOverview(userId: string) {
    return this.progressService.overviewForMangaka(userId)
  }

  hold(userId: string, chapterId: string, body: HoldChapterBodyType) {
    return this.holdService.hold(userId, chapterId, body)
  }

  resume(userId: string, chapterId: string) {
    return this.holdService.resume(userId, chapterId)
  }

  async createPage(userId: string, chapterId: string, body: CreatePageBodyType) {
    const page = await this.pageService.createPage(userId, chapterId, body)
    return toPageRes(page)
  }

  async listPages(chapterId: string) {
    const pages = await this.pageService.listPages(chapterId)
    return { items: pages.map(toPageRes) }
  }

  async updatePage(userId: string, pageId: string, body: UpdatePageBodyType) {
    const page = await this.pageService.updatePage(userId, pageId, body)
    return toPageRes(page!)
  }

  async markCompositeReady(userId: string, chapterId: string) {
    await this.reviewService.markCompositeReady(userId, chapterId)
    return this.getOne(chapterId)
  }
  async submit(userId: string, chapterId: string) {
    await this.reviewService.submit(userId, chapterId)
    return this.getOne(chapterId)
  }
  async requestRevision(userId: string, chapterId: string, reason?: string) {
    await this.reviewService.requestRevision(userId, chapterId, reason)
    return this.getOne(chapterId)
  }
  async resubmit(userId: string, chapterId: string) {
    await this.reviewService.resubmit(userId, chapterId)
    return this.getOne(chapterId)
  }
  async approve(userId: string, chapterId: string) {
    await this.reviewService.approve(userId, chapterId)
    return this.getOne(chapterId)
  }
  async publish(userId: string, chapterId: string) {
    await this.publishService.publish(userId, chapterId)
    return this.getOne(chapterId)
  }
  async coOwnerApprove(userId: string, chapterId: string) {
    await this.coOwnerService.approve(userId, chapterId)
    return this.getOne(chapterId)
  }
  async coOwnerReject(userId: string, chapterId: string, reason: string) {
    await this.coOwnerService.reject(userId, chapterId, reason)
    return this.getOne(chapterId)
  }
}
