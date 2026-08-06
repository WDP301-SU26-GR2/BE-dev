import { Injectable } from '@nestjs/common'
import { toChapterRes } from '../chapter.mapper'
import {
  CreateChapterBodyType,
  ExtendDeadlineBodyType,
  HoldChapterBodyType,
  SetScheduleBodyType,
  UpdateChapterBodyType
} from '../schemas/chapter-schemas'
import { ChapterCreationService } from './chapter-creation.service'
import { ChapterCrudService } from './chapter-crud.service'
import { ChapterHoldService } from './chapter-hold.service'
import { ChapterQueryService } from './chapter-query.service'
import { ScheduleService } from './schedule.service'

@Injectable()
export class ChapterPlanningService {
  constructor(
    private readonly creationService: ChapterCreationService,
    private readonly crudService: ChapterCrudService,
    private readonly scheduleService: ScheduleService,
    private readonly holdService: ChapterHoldService,
    private readonly queryService: ChapterQueryService
  ) {}

  async create(userId: string, body: CreateChapterBodyType) {
    return toChapterRes((await this.creationService.create(userId, body))!)
  }

  async updateChapter(userId: string, chapterId: string, body: UpdateChapterBodyType) {
    return toChapterRes((await this.crudService.updateChapter(userId, chapterId, body))!)
  }

  deleteChapter(userId: string, id: string) {
    return this.crudService.deleteChapter(userId, id)
  }

  async setSchedule(userId: string, chapterId: string, body: SetScheduleBodyType) {
    await this.scheduleService.setSchedule(userId, chapterId, body)
    return this.queryService.getOneUnchecked(chapterId)
  }

  async extendDeadline(userId: string, chapterId: string, body: ExtendDeadlineBodyType) {
    await this.scheduleService.extendDeadline(userId, chapterId, body)
    return this.queryService.getOneUnchecked(chapterId)
  }

  hold(userId: string, chapterId: string, body: HoldChapterBodyType) {
    return this.holdService.hold(userId, chapterId, body)
  }

  resume(userId: string, chapterId: string) {
    return this.holdService.resume(userId, chapterId)
  }
}
