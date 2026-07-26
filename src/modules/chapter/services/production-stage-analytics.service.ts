import { Injectable } from '@nestjs/common'
import { ProductionStageStatus, TaskStatus } from '@prisma/client'
import { STAGE_OPEN_TASK_STATUSES } from '../production-stage.constant'
import { ProductionStageRepository } from '../production-stage.repo'
import { ProductionStageAccessService } from './production-stage-access.service'
import { toProductionStageRes } from './production-stage.mapper'

@Injectable()
export class ProductionStageAnalyticsService {
  constructor(
    private readonly repo: ProductionStageRepository,
    private readonly accessService: ProductionStageAccessService
  ) {}

  async list(user: { userId: string; roleName: string }, chapterId: string) {
    await this.accessService.assertReadAccess(user, chapterId)
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
    const duration = (startedAt: Date | null, completedAt: Date | null) =>
      startedAt ? (completedAt ?? new Date(now)).getTime() - startedAt.getTime() : 0
    const stageRes = stages.map((stage) => {
      const stageTasks = byStage.get(stage.id) ?? []
      const durations = stageTasks.map((task) => ({
        task,
        duration: duration(task.startedAt, task.completedAt)
      }))
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
        ...toProductionStageRes(stage),
        analytics: {
          taskCount: stageTasks.length,
          approvedCount: stageTasks.filter((task) => task.status === TaskStatus.APPROVED).length,
          openCount: stageTasks.filter((task) => STAGE_OPEN_TASK_STATUSES.includes(task.status)).length,
          totalTaskDurationMs: total,
          avgTaskDurationMs: stageTasks.length ? Math.round(total / stageTasks.length) : 0,
          lateTaskCount,
          stageDurationMs: stage.startedAt ? duration(stage.startedAt, stage.completedAt) : null,
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
}
