import { Injectable } from '@nestjs/common'
import { AuditEntityType, NotificationType, RegionType, TaskStatus } from '@prisma/client'
import { AuditService } from 'src/modules/audit/audit.service'
import { NotificationService } from 'src/modules/notification/notification.service'
import {
  NotSeriesOwnerException,
  PageNotFoundException,
  ChapterOnHoldTaskException,
  RegionHasApprovedTasksException,
  RegionNotFoundException
} from '../errors/task.errors'
import { TaskRepository } from '../task.repo'
import { toRegionRes } from '../task.mapper'
import { CreateRegionBodyType, UpdateRegionBodyType } from '../schemas/task-schemas'
import { CANCELABLE_TASK_STATUSES } from '../task.constant'
import { TaskMessages } from '../task.messages'
import { TaskStateService } from './task-state.service'

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/

export type AiProposedRegionInput = {
  regionType: RegionType
  detectedSubtype: string | null
  coordinates: { x: number; y: number; width: number; height: number }
  confidenceScore: number
}

@Injectable()
export class RegionService {
  constructor(
    private readonly taskRepository: TaskRepository,
    private readonly taskStateService: TaskStateService,
    private readonly notificationService: NotificationService,
    private readonly auditService: AuditService
  ) {}

  async assertPageOwner(mangakaId: string, pageId: string, opts: { checkHold?: boolean } = {}) {
    if (!OBJECT_ID_RE.test(pageId)) throw PageNotFoundException
    const page = await this.taskRepository.findPageWithOwner(pageId)
    if (!page) throw PageNotFoundException
    if (page.chapter.series.mangakaId !== mangakaId) throw NotSeriesOwnerException
    if (opts.checkHold !== false && page.chapter.hold) throw ChapterOnHoldTaskException
    return page
  }

  async create(mangakaId: string, pageId: string, body: CreateRegionBodyType) {
    await this.assertPageOwner(mangakaId, pageId)
    const region = await this.taskRepository.createRegion({
      pageId,
      coordinates: body.coordinates,
      regionType: body.regionType ?? null
    })
    return toRegionRes(region)
  }

  async listByPage(mangakaId: string, pageId: string) {
    await this.assertPageOwner(mangakaId, pageId, { checkHold: false })
    const rows = await this.taskRepository.listRegionsByPage(pageId)
    return { items: rows.map(toRegionRes) }
  }

  private async requireRegionOwner(mangakaId: string, regionId: string) {
    if (!OBJECT_ID_RE.test(regionId)) throw RegionNotFoundException
    const region = await this.taskRepository.findRegionById(regionId)
    if (!region) throw RegionNotFoundException
    await this.assertPageOwner(mangakaId, region.pageId)
    return region
  }

  async update(mangakaId: string, regionId: string, body: UpdateRegionBodyType) {
    await this.requireRegionOwner(mangakaId, regionId)
    const data: {
      coordinates?: CreateRegionBodyType['coordinates']
      regionType?: UpdateRegionBodyType['regionType']
      confirmedByMangaka?: boolean
    } = {}
    if (body.coordinates != null) data.coordinates = body.coordinates
    if (body.regionType != null) data.regionType = body.regionType
    if (body.confirmedByMangaka != null) data.confirmedByMangaka = body.confirmedByMangaka
    const updated = await this.taskRepository.updateRegion(regionId, data)
    return toRegionRes(updated)
  }

  async remove(mangakaId: string, regionId: string) {
    await this.requireRegionOwner(mangakaId, regionId)
    const tasks = await this.taskRepository.findTasksByRegion(regionId)
    if (tasks.some((task) => task.status === TaskStatus.APPROVED)) throw RegionHasApprovedTasksException
    const cancellable = tasks.filter((task) => CANCELABLE_TASK_STATUSES.includes(task.status))
    const cancelledTaskIds = cancellable.map((task) => task.id)
    await this.taskStateService.cancelRegionTasksAndDeleteRegion(regionId, cancelledTaskIds)
    await this.auditService.record({
      actorId: mangakaId,
      entityType: AuditEntityType.REGION,
      entityId: regionId,
      action: 'REGION_DELETE_CASCADE',
      reason: cancelledTaskIds.length > 0 ? `cancelled tasks: ${cancelledTaskIds.join(',')}` : 'no tasks'
    })
    for (const task of cancellable) {
      if (!task.assistantId) continue
      await this.notificationService.notifySafe({
        recipientId: task.assistantId,
        type: NotificationType.TASK,
        referenceId: task.id,
        referenceType: 'TASK_CANCELLED',
        content: TaskMessages.notification.taskCancelled
      })
    }
    return { regionId, cancelledTaskIds }
  }

  async applyAiRegions(pageId: string, regions: AiProposedRegionInput[], meta: { aiModelVersion: string | null }) {
    const existing = await this.taskRepository.findAiRegionsByPage(pageId)
    const deletable: string[] = []
    let skipped = 0

    for (const region of existing) {
      if (region.confirmedByMangaka) {
        skipped++
        continue
      }
      const taskCount = await this.taskRepository.countTasksByRegion(region.id)
      if (taskCount > 0) {
        skipped++
        continue
      }
      deletable.push(region.id)
    }

    const created = await this.taskRepository.replaceAiRegions(pageId, deletable, regions, meta)
    return { created, removed: deletable.length, skipped }
  }
}
