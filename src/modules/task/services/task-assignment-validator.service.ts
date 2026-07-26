import { Injectable } from '@nestjs/common'
import { ProductionStageStatus, Specialization } from '@prisma/client'
import { isObjectId } from 'src/core/http/schemas/object-id.schema'
import { PAGE_EDITABLE_STATUSES } from 'src/modules/chapter/chapter.constant'
import {
  StageLockedException,
  StageNotFoundException,
  StagePageNotFoundException,
  StageRequiredException,
  TaskTypeNotInStageException
} from 'src/modules/chapter/errors/production-stage.errors'
import { StudioAssignmentService } from 'src/modules/studio/services/studio-assignment.service'
import {
  AssetNotFoundException,
  AssistantNotHiredException,
  ChapterOnHoldTaskException,
  NotSeriesOwnerException,
  PageNotEditableTaskException,
  PageNotFoundException,
  RegionNotFoundException
} from '../errors/task.errors'
import { ProductionStageQueryPort } from '../ports/production-stage-query.port'
import { TaskAssetQueryPort } from '../ports/task-asset-query.port'
import { TaskRepository } from '../task.repo'

@Injectable()
export class TaskAssignmentValidatorService {
  constructor(
    private readonly taskRepository: TaskRepository,
    private readonly studioAssignmentService: StudioAssignmentService,
    private readonly taskAssetQuery: TaskAssetQueryPort,
    private readonly productionStageQuery: ProductionStageQueryPort
  ) {}

  async requirePageOwner(mangakaId: string, pageId: string, opts: { checkHold?: boolean } = {}) {
    if (!isObjectId(pageId)) throw PageNotFoundException
    const page = await this.taskRepository.findPageWithOwner(pageId)
    if (!page) throw PageNotFoundException
    if (page.chapter.series.mangakaId !== mangakaId) throw NotSeriesOwnerException
    if (opts.checkHold !== false && page.chapter.hold) throw ChapterOnHoldTaskException
    if (!PAGE_EDITABLE_STATUSES.includes(page.status)) throw PageNotEditableTaskException
    return page
  }

  async validateAssign(mangakaId: string, body: { pageId: string; assistantId: string; assetIds: string[] }) {
    const page = await this.requirePageOwner(mangakaId, body.pageId)
    if (!(await this.studioAssignmentService.findActiveForPair(mangakaId, body.assistantId))) {
      throw AssistantNotHiredException
    }
    if (body.assetIds.length > 0) {
      const found = await this.taskAssetQuery.findExistingAssetIds(body.assetIds)
      if (found.length !== body.assetIds.length) throw AssetNotFoundException
    }
    return page
  }

  async validateStageBinding(chapterId: string, pageId: string, stageId: string | undefined, taskType: Specialization) {
    if ((await this.productionStageQuery.countByChapter(chapterId)) === 0) return
    if (!stageId) throw StageRequiredException
    if (!isObjectId(stageId)) throw StageNotFoundException
    const stage = await this.productionStageQuery.findById(stageId)
    if (!stage || stage.chapterId !== chapterId) throw StageNotFoundException
    if (stage.status !== ProductionStageStatus.ACTIVE) throw StageLockedException
    if (!stage.taskTypes.includes(taskType)) throw TaskTypeNotInStageException
    if (!(await this.productionStageQuery.hasStagePage(stage.id, pageId))) throw StagePageNotFoundException
  }

  async resolveRegionIds(pageId: string, regionIds: string[]) {
    const ids = [...new Set(regionIds)]
    if (ids.length === 0) return []
    if (ids.some((id) => !isObjectId(id))) throw RegionNotFoundException
    const regions = await this.taskRepository.findRegionsByIds(ids)
    if (regions.length !== ids.length || regions.some((region) => region.pageId !== pageId)) {
      throw RegionNotFoundException
    }
    return ids
  }
}
