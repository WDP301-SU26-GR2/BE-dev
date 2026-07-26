import { Injectable } from '@nestjs/common'
import { ProductionStageStatus, TaskStatus } from '@prisma/client'
import { ChapterRepository } from '../chapter.repo'
import { ChapterOnHoldException } from '../errors/chapter.errors'
import {
  StageNotDeletableException,
  StageNotEditableException,
  StageNotFoundException
} from '../errors/production-stage.errors'
import { ProductionStageRepository } from '../production-stage.repo'
import { CreateStageBodyType, UpdateStageBodyType } from '../schemas/production-stage-schemas'
import { ProductionStageAccessService } from './production-stage-access.service'
import { ProductionStageAnalyticsService } from './production-stage-analytics.service'
import { toProductionStageRes } from './production-stage.mapper'
import { ProductionStageStateService } from './production-stage-state.service'

@Injectable()
export class ProductionStageService {
  constructor(
    private readonly repo: ProductionStageRepository,
    private readonly chapterRepo: ChapterRepository,
    private readonly stateService: ProductionStageStateService,
    private readonly accessService: ProductionStageAccessService,
    private readonly analyticsService: ProductionStageAnalyticsService
  ) {}

  async list(user: { userId: string; roleName: string }, chapterId: string) {
    return this.analyticsService.list(user, chapterId)
  }

  async complete(user: { userId: string; roleName: string }, chapterId: string, stageId: string) {
    const { chapter } = await this.accessService.assertMangakaOwner(user.userId, chapterId)
    if (chapter.hold) throw ChapterOnHoldException
    await this.stateService.completeStage(chapterId, stageId, user.userId)
    return { message: 'Đã hoàn thành giai đoạn' }
  }

  async patch(
    user: { userId: string; roleName: string },
    chapterId: string,
    stageId: string,
    body: UpdateStageBodyType
  ) {
    await this.accessService.assertMangakaOwner(user.userId, chapterId)
    const stage = await this.repo.findById(stageId)
    if (!stage || stage.chapterId !== chapterId) throw StageNotFoundException
    if (stage.status === ProductionStageStatus.COMPLETED) throw StageNotEditableException
    const updated = await this.repo.updateMeta(stageId, {
      ...(body.name != null ? { name: body.name } : {}),
      ...(body.deadline !== undefined ? { deadline: body.deadline ? new Date(body.deadline) : null } : {})
    })
    const schedule = await this.chapterRepo.findScheduleByChapterId(chapterId)
    return {
      ...toProductionStageRes(updated),
      warnings:
        updated.deadline && schedule?.currentDeadline && updated.deadline > schedule.currentDeadline
          ? ['STAGE_DEADLINE_EXCEEDS_CHAPTER']
          : []
    }
  }

  async add(user: { userId: string; roleName: string }, chapterId: string, body: CreateStageBodyType) {
    await this.accessService.assertMangakaOwner(user.userId, chapterId)
    const [after, stages] = await Promise.all([
      this.repo.findById(body.afterStageId),
      this.repo.findByChapter(chapterId)
    ])
    if (!after || after.chapterId !== chapterId) throw StageNotFoundException
    const finalCheck = stages.find((stage) => stage.isFinalCheck)
    const active = stages.find((stage) => stage.status === ProductionStageStatus.ACTIVE)
    if (
      after.isFinalCheck ||
      !finalCheck ||
      after.order >= finalCheck.order ||
      after.status === ProductionStageStatus.COMPLETED ||
      (active && after.order < active.order)
    ) {
      throw StageNotDeletableException
    }
    const order = after.order + 1
    await this.repo.shiftOrderFrom(chapterId, order, 1)
    return toProductionStageRes(
      await this.repo.create({
        chapterId,
        order,
        name: body.name,
        taskTypes: body.taskTypes,
        isFinalCheck: false,
        status: ProductionStageStatus.LOCKED
      })
    )
  }

  async remove(user: { userId: string; roleName: string }, chapterId: string, stageId: string) {
    await this.accessService.assertMangakaOwner(user.userId, chapterId)
    const stage = await this.repo.findById(stageId)
    if (!stage || stage.chapterId !== chapterId) throw StageNotFoundException
    const taskCount = await this.repo.countTasksByStage(stageId, Object.values(TaskStatus))
    if (stage.status !== ProductionStageStatus.LOCKED || stage.isFinalCheck || taskCount > 0)
      throw StageNotDeletableException
    await this.repo.deleteById(stageId)
    await this.repo.shiftOrderFrom(chapterId, stage.order + 1, -1)
    return { message: 'Đã xoá giai đoạn' }
  }
}
