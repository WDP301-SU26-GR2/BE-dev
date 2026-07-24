import { Injectable } from '@nestjs/common'
import { ProductionStageStatus, Specialization, TaskStatus } from '@prisma/client'
import { RoleName } from 'src/core/security/constants/role.constant'
import { ChapterRepository } from '../chapter.repo'
import { ChapterNotFoundException, ChapterOnHoldException } from '../errors/chapter.errors'
import {
  StageAccessDeniedException,
  StageNotDeletableException,
  StageNotEditableException,
  StageNotFoundException
} from '../errors/production-stage.errors'
import { STAGE_OPEN_TASK_STATUSES } from '../production-stage.constant'
import { ProductionStageRepository } from '../production-stage.repo'
import { CreateStageBodyType, UpdateStageBodyType } from '../schemas/production-stage-schemas'
import { ProductionStageStateService } from './production-stage-state.service'

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/

@Injectable()
export class ProductionStageService {
  constructor(
    private readonly repo: ProductionStageRepository,
    private readonly chapterRepo: ChapterRepository,
    private readonly stateService: ProductionStageStateService
  ) {}

  private async assertReadAccess(user: { userId: string; roleName: string }, chapterId: string) {
    if (!OBJECT_ID_RE.test(chapterId)) throw ChapterNotFoundException
    const chapter = await this.chapterRepo.findChapterById(chapterId)
    if (!chapter) throw ChapterNotFoundException
    const series = await this.chapterRepo.findSeriesById(chapter.seriesId)
    if (!series) throw ChapterNotFoundException
    const allowed =
      (user.roleName === RoleName.MANGAKA && series.mangakaId === user.userId) ||
      (user.roleName === RoleName.EDITOR && series.editorId === user.userId) ||
      user.roleName === RoleName.BOARD_MEMBER ||
      user.roleName === RoleName.SUPER_ADMIN
    if (!allowed) throw StageAccessDeniedException
    return { chapter, series }
  }

  private async assertMangakaOwner(userId: string, chapterId: string) {
    const { chapter, series } = await this.assertReadAccess({ userId, roleName: RoleName.MANGAKA }, chapterId)
    if (series.mangakaId !== userId) throw StageAccessDeniedException
    return { chapter, series }
  }

  async list(user: { userId: string; roleName: string }, chapterId: string) {
    await this.assertReadAccess(user, chapterId)
    const [stages, tasks] = await Promise.all([
      this.repo.findByChapter(chapterId),
      this.repo.findTasksForStageAnalytics(chapterId)
    ])
    const now = Date.now()
    const byStage = new Map<string, typeof tasks>()
    for (const task of tasks) {
      if (!task.stageId) continue
      byStage.set(task.stageId, [...(byStage.get(task.stageId) ?? []), task])
    }
    const taskDuration = (startedAt: Date | null, completedAt: Date | null) =>
      startedAt ? (completedAt ?? new Date(now)).getTime() - startedAt.getTime() : 0
    const stageRes = stages.map((stage) => {
      const stageTasks = byStage.get(stage.id) ?? []
      const durations = stageTasks.map((task) => ({ task, duration: taskDuration(task.startedAt, task.completedAt) }))
      const longest = durations.reduce<(typeof durations)[number] | null>(
        (current, item) => (!current || item.duration > current.duration ? item : current),
        null
      )
      const total = durations.reduce((sum, item) => sum + item.duration, 0)
      const lateTaskCount = stageTasks.filter(
        (task) =>
          task.completedAt &&
          (task.deadline
            ? task.completedAt > task.deadline
            : stage.deadline
              ? task.completedAt > stage.deadline
              : false)
      ).length
      return {
        ...this.toRes(stage),
        analytics: {
          taskCount: stageTasks.length,
          approvedCount: stageTasks.filter((task) => task.status === TaskStatus.APPROVED).length,
          openCount: stageTasks.filter((task) => STAGE_OPEN_TASK_STATUSES.includes(task.status)).length,
          totalTaskDurationMs: total,
          avgTaskDurationMs: stageTasks.length ? Math.round(total / stageTasks.length) : 0,
          lateTaskCount,
          stageDurationMs: stage.startedAt ? taskDuration(stage.startedAt, stage.completedAt) : null,
          longestTask:
            longest && longest.duration > 0
              ? {
                  taskId: longest.task.id,
                  taskType: longest.task.taskType ?? null,
                  assistantId: longest.task.assistantId ?? null,
                  durationMs: longest.duration
                }
              : null
        }
      }
    })
    const active = stages.find((stage) => stage.status === ProductionStageStatus.ACTIVE)
    const bottleneckStage = stageRes
      .filter((stage) => stage.analytics.stageDurationMs != null)
      .reduce<{
        stageId: string
        name: string
        stageDurationMs: number
      } | null>(
        (current, stage) =>
          !current || (stage.analytics.stageDurationMs ?? 0) > current.stageDurationMs
            ? { stageId: stage.id, name: stage.name, stageDurationMs: stage.analytics.stageDurationMs ?? 0 }
            : current,
        null
      )
    return {
      stages: stageRes,
      currentStage: active ? { id: active.id, name: active.name, order: active.order } : null,
      bottleneckStage
    }
  }

  async complete(user: { userId: string; roleName: string }, chapterId: string, stageId: string) {
    const { chapter } = await this.assertMangakaOwner(user.userId, chapterId)
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
    await this.assertMangakaOwner(user.userId, chapterId)
    const stage = await this.repo.findById(stageId)
    if (!stage || stage.chapterId !== chapterId) throw StageNotFoundException
    if (stage.status === ProductionStageStatus.COMPLETED) throw StageNotEditableException
    const updated = await this.repo.updateMeta(stageId, {
      ...(body.name != null ? { name: body.name } : {}),
      ...(body.deadline !== undefined ? { deadline: body.deadline ? new Date(body.deadline) : null } : {})
    })
    const schedule = await this.chapterRepo.findScheduleByChapterId(chapterId)
    return {
      ...this.toRes(updated),
      warnings:
        updated.deadline && schedule?.currentDeadline && updated.deadline > schedule.currentDeadline
          ? ['STAGE_DEADLINE_EXCEEDS_CHAPTER']
          : []
    }
  }

  async add(user: { userId: string; roleName: string }, chapterId: string, body: CreateStageBodyType) {
    await this.assertMangakaOwner(user.userId, chapterId)
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
    return this.toRes(
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
    await this.assertMangakaOwner(user.userId, chapterId)
    const stage = await this.repo.findById(stageId)
    if (!stage || stage.chapterId !== chapterId) throw StageNotFoundException
    const taskCount = await this.repo.countTasksByStage(stageId, Object.values(TaskStatus))
    if (stage.status !== ProductionStageStatus.LOCKED || stage.isFinalCheck || taskCount > 0)
      throw StageNotDeletableException
    await this.repo.deleteById(stageId)
    await this.repo.shiftOrderFrom(chapterId, stage.order + 1, -1)
    return { message: 'Đã xoá giai đoạn' }
  }

  private toRes(stage: {
    id: string
    chapterId: string
    order: number
    name: string
    taskTypes: Specialization[]
    isFinalCheck: boolean
    status: ProductionStageStatus
    deadline: Date | null
    startedAt: Date | null
    completedAt: Date | null
  }) {
    return {
      id: stage.id,
      chapterId: stage.chapterId,
      order: stage.order,
      name: stage.name,
      taskTypes: stage.taskTypes,
      isFinalCheck: stage.isFinalCheck,
      status: stage.status,
      deadline: stage.deadline?.toISOString() ?? null,
      startedAt: stage.startedAt?.toISOString() ?? null,
      completedAt: stage.completedAt?.toISOString() ?? null,
      analytics: {
        taskCount: 0,
        approvedCount: 0,
        openCount: 0,
        totalTaskDurationMs: 0,
        avgTaskDurationMs: 0,
        lateTaskCount: 0,
        stageDurationMs: null,
        longestTask: null
      }
    }
  }
}
