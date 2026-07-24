import { Injectable } from '@nestjs/common'
import { AuditEntityType, ProductionStageStatus } from '@prisma/client'
import { AuditService } from 'src/modules/audit/audit.service'
import { DEFAULT_STAGE_TEMPLATE, STAGE_OPEN_TASK_STATUSES } from '../production-stage.constant'
import { ProductionStageRepository } from '../production-stage.repo'
import {
  StageHasOpenTasksException,
  StageNotActiveException,
  StageNotFoundException,
  StageOutputNotReadyException
} from '../errors/production-stage.errors'

@Injectable()
export class ProductionStageStateService {
  constructor(
    private readonly repo: ProductionStageRepository,
    private readonly auditService: AuditService
  ) {}

  async seedForChapter(chapterId: string): Promise<void> {
    if ((await this.repo.countByChapter(chapterId)) > 0) return
    const now = new Date()
    await this.repo.seedStagesAndFirstInputs(
      chapterId,
      DEFAULT_STAGE_TEMPLATE.map((template) => ({
        chapterId,
        order: template.order,
        name: template.name,
        taskTypes: template.taskTypes,
        isFinalCheck: template.isFinalCheck,
        status: template.order === 1 ? ProductionStageStatus.ACTIVE : ProductionStageStatus.LOCKED,
        startedAt: template.order === 1 ? now : null
      }))
    )
  }

  async completeStage(chapterId: string, stageId: string, actorId: string): Promise<void> {
    const stage = await this.repo.findById(stageId)
    if (!stage || stage.chapterId !== chapterId) throw StageNotFoundException
    if (stage.status !== ProductionStageStatus.ACTIVE) throw StageNotActiveException
    if ((await this.repo.countTasksByStage(stageId, STAGE_OPEN_TASK_STATUSES)) > 0) throw StageHasOpenTasksException

    const [stagePages, pageCount, allStages] = await Promise.all([
      this.repo.findStagePages(stageId),
      this.repo.countPagesByChapter(chapterId),
      this.repo.findByChapter(chapterId)
    ])
    if (
      stagePages.length !== pageCount ||
      stagePages.some(
        (page) =>
          !page.outputConfirmedAt || !page.outputFileKey || page.outputRevision == null || !page.outputSourceType
      )
    ) {
      throw StageOutputNotReadyException
    }
    const next = allStages.find((item) => item.order === stage.order + 1) ?? null
    await this.repo.completeAndOpenNext(stage, next, stagePages, new Date())
    await this.auditService.record({
      actorId,
      entityType: AuditEntityType.CHAPTER,
      entityId: chapterId,
      action: 'PRODUCTION_STAGE_COMPLETE',
      fromState: stage.name,
      toState: next?.name ?? 'DONE'
    })
  }

  async markFinalCheckCompleted(chapterId: string): Promise<void> {
    const finalCheck = await this.repo.findFinalCheck(chapterId)
    if (finalCheck?.status === ProductionStageStatus.ACTIVE) {
      await this.repo.updateStatus(finalCheck.id, ProductionStageStatus.COMPLETED, new Date())
    }
  }
}
