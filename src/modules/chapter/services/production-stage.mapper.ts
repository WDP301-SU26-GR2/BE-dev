import { ProductionStageStatus, Specialization } from '@prisma/client'

export type ProductionStageRecord = {
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
}

export const toProductionStageRes = (stage: ProductionStageRecord) => ({
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
})
