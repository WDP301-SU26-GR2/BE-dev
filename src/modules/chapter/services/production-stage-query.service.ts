import { Injectable } from '@nestjs/common'
import { ProductionStageQueryPort as AiProductionStageQueryPort } from 'src/modules/ai/ports/production-stage-query.port'
import { ProductionStageQueryPort as TaskProductionStageQueryPort } from 'src/modules/task/ports/production-stage-query.port'
import { ProductionStageRepository } from '../production-stage.repo'

@Injectable()
export class ProductionStageQueryService implements AiProductionStageQueryPort, TaskProductionStageQueryPort {
  constructor(private readonly repository: ProductionStageRepository) {}

  countByChapter(chapterId: string) {
    return this.repository.countByChapter(chapterId)
  }

  findById(stageId: string) {
    return this.repository.findById(stageId)
  }

  findStagePage(stageId: string, pageId: string) {
    return this.repository.findStagePage(stageId, pageId)
  }

  async hasStagePage(stageId: string, pageId: string) {
    return (await this.repository.findStagePage(stageId, pageId)) !== null
  }
}
