import { ProductionStageStatus, Specialization } from '@prisma/client'

export type TaskProductionStage = {
  id: string
  chapterId: string
  status: ProductionStageStatus
  taskTypes: Specialization[]
}

export abstract class ProductionStageQueryPort {
  abstract countByChapter(chapterId: string): Promise<number>
  abstract findById(stageId: string): Promise<TaskProductionStage | null>
  abstract hasStagePage(stageId: string, pageId: string): Promise<boolean>
}
