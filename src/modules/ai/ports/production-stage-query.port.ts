import { AiSegmentSource, ProductionStageStatus } from '@prisma/client'

export type AiProductionStage = {
  id: string
  chapterId: string
  name: string
  isFinalCheck: boolean
  status: ProductionStageStatus
}

export type AiProductionStagePage = {
  inputSourceType: AiSegmentSource
  inputFileKey: string
  inputRevision: number
}

export abstract class ProductionStageQueryPort {
  abstract countByChapter(chapterId: string): Promise<number>
  abstract findById(stageId: string): Promise<AiProductionStage | null>
  abstract findStagePage(stageId: string, pageId: string): Promise<AiProductionStagePage | null>
}
