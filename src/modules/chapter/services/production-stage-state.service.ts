import { Injectable } from '@nestjs/common'
import { AuditEntityType, ProductionStageStatus } from '@prisma/client'
import { AuditService } from 'src/modules/audit/audit.service'
import { DEFAULT_STAGE_TEMPLATE, STAGE_OPEN_TASK_STATUSES } from '../production-stage.constant'
import { ProductionStageRepository } from '../production-stage.repo'
import {
  FinalCheckNotCompletableException,
  StageHasOpenTasksException,
  StageNotActiveException,
  StageNotFoundException,
  StageNotReopenableException,
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
    // FINAL_CHECK is closed by submit/resubmit, not by the manual complete route.
    if (stage.isFinalCheck) throw FinalCheckNotCompletableException
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

  async reopenStage(
    chapterId: string,
    stageId: string,
    actorId: string
  ): Promise<{ stageId: string; relockedStageIds: string[]; clearedStagePages: number }> {
    const stages = await this.repo.findByChapter(chapterId)
    const stage = stages.find((item) => item.id === stageId)
    if (!stage) throw StageNotFoundException
    if (stage.status !== ProductionStageStatus.COMPLETED) throw StageNotReopenableException

    for (const item of stages.filter((entry) => entry.order >= stage.order)) {
      if ((await this.repo.countTasksByStage(item.id, STAGE_OPEN_TASK_STATUSES)) > 0) {
        throw StageHasOpenTasksException
      }
    }

    const later = stages.filter((item) => item.order > stage.order)
    const laterIds = later.map((item) => item.id)
    const { clearedStagePages } = await this.repo.reopenStageAndRelockAfter(stage.id, laterIds, new Date())

    await this.auditService.record({
      actorId,
      entityType: AuditEntityType.CHAPTER,
      entityId: chapterId,
      action: 'PRODUCTION_STAGE_REOPEN',
      fromState: ProductionStageStatus.COMPLETED,
      toState: ProductionStageStatus.ACTIVE,
      reason: `stage=${stage.name}(order=${stage.order}); relocked=[${later
        .map((item) => item.name)
        .join(',')}]; clearedStagePages=${clearedStagePages}`
    })

    return { stageId: stage.id, relockedStageIds: laterIds, clearedStagePages }
  }
}
