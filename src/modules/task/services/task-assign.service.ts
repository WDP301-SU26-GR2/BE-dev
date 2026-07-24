import { randomUUID } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { NotificationType, ProductionStageStatus, Specialization, TaskStatus } from '@prisma/client'
import { NotificationService } from 'src/modules/notification/notification.service'
import { PAGE_EDITABLE_STATUSES } from 'src/modules/chapter/chapter.constant'
import { ProductionStageRepository } from 'src/modules/chapter/production-stage.repo'
import {
  StageLockedException,
  StageNotFoundException,
  StagePageNotFoundException,
  StageRequiredException,
  TaskTypeNotInStageException
} from 'src/modules/chapter/errors/production-stage.errors'
import { StudioAssignmentService } from 'src/modules/studio/services/studio-assignment.service'
import { StorageRepository } from 'src/modules/storage/storage.repo'
import {
  AssetNotFoundException,
  AssistantNotHiredException,
  ChapterOnHoldTaskException,
  NotSeriesOwnerException,
  PageNotEditableTaskException,
  PageNotFoundException,
  RegionNotFoundException,
  TaskNotFoundException,
  TaskNotCancellableException,
  TaskDescriptionLockedException,
  TaskNotReassignableException
} from '../errors/task.errors'
import { TaskRepository } from '../task.repo'
import { TaskStateService } from './task-state.service'
import { toTaskRes } from '../task.mapper'
import {
  CreateTaskGroupBodyType,
  BatchCreateTaskBodyType,
  CancelTaskBodyType,
  CreateTaskBodyType,
  ReassignTaskBodyType
} from '../schemas/task-schemas'
import { TaskMessages } from '../task.messages'
import { CANCELABLE_TASK_STATUSES, REASSIGNABLE_TASK_STATUSES } from '../task.constant'

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/

@Injectable()
export class TaskAssignService {
  constructor(
    private readonly taskRepository: TaskRepository,
    private readonly studioAssignmentService: StudioAssignmentService,
    private readonly storageRepository: StorageRepository,
    private readonly taskStateService: TaskStateService,
    private readonly notificationService: NotificationService,
    private readonly productionStageRepository: ProductionStageRepository
  ) {}

  private async requirePageOwner(mangakaId: string, pageId: string, opts: { checkHold?: boolean } = {}) {
    if (!OBJECT_ID_RE.test(pageId)) throw PageNotFoundException
    const page = await this.taskRepository.findPageWithOwner(pageId)
    if (!page) throw PageNotFoundException
    if (page.chapter.series.mangakaId !== mangakaId) throw NotSeriesOwnerException
    if (opts.checkHold !== false && page.chapter.hold) throw ChapterOnHoldTaskException
    if (!PAGE_EDITABLE_STATUSES.includes(page.status)) throw PageNotEditableTaskException
    return page
  }

  private async validateAssign(mangakaId: string, body: { pageId: string; assistantId: string; assetIds: string[] }) {
    const page = await this.requirePageOwner(mangakaId, body.pageId)
    const active = await this.studioAssignmentService.findActiveForPair(mangakaId, body.assistantId)
    if (!active) throw AssistantNotHiredException
    if (body.assetIds.length > 0) {
      const found = await this.storageRepository.findAssetsByIds(body.assetIds)
      if (found.length !== body.assetIds.length) throw AssetNotFoundException
    }
    return page
  }

  private async validateStageBinding(
    chapterId: string,
    pageId: string,
    stageId: string | undefined,
    taskType: Specialization
  ) {
    const stageCount = await this.productionStageRepository.countByChapter(chapterId)
    if (stageCount === 0) return
    if (!stageId) throw StageRequiredException
    if (!OBJECT_ID_RE.test(stageId)) throw StageNotFoundException

    const stage = await this.productionStageRepository.findById(stageId)
    if (!stage || stage.chapterId !== chapterId) throw StageNotFoundException
    if (stage.status !== ProductionStageStatus.ACTIVE) throw StageLockedException
    if (!stage.taskTypes.includes(taskType)) throw TaskTypeNotInStageException
    if (!(await this.productionStageRepository.findStagePage(stage.id, pageId))) throw StagePageNotFoundException
  }

  // Mọi regionId phải là 24-hex, tồn tại, và cùng thuộc pageId (chống gắn vùng của trang khác). Trả về mảng dedupe.
  private async resolveRegionIds(pageId: string, regionIds: string[]): Promise<string[]> {
    const ids = [...new Set(regionIds)]
    if (ids.length === 0) return []
    if (ids.some((id) => !OBJECT_ID_RE.test(id))) throw RegionNotFoundException
    const regions = await this.taskRepository.findRegionsByIds(ids)
    if (regions.length !== ids.length || regions.some((r) => r.pageId !== pageId)) throw RegionNotFoundException
    return ids
  }

  private async notifyAssigned(assistantId: string, taskId: string) {
    await this.notificationService.notifySafe({
      recipientId: assistantId,
      type: NotificationType.TASK,
      referenceId: taskId,
      referenceType: 'TASK_ASSIGNED',
      content: TaskMessages.notification.taskAssigned
    })
  }

  async create(mangakaId: string, body: CreateTaskBodyType) {
    const page = await this.validateAssign(mangakaId, body)
    await this.validateStageBinding(page.chapterId, body.pageId, body.stageId, body.taskType)
    const regionIds = await this.resolveRegionIds(body.pageId, body.regionIds)
    const task = await this.taskRepository.createTask({
      pageId: body.pageId,
      regionIds,
      assistantId: body.assistantId,
      taskType: body.taskType,
      stageId: body.stageId,
      description: body.description,
      deadline: body.deadline ? new Date(body.deadline) : null,
      priority: body.priority,
      assetIds: body.assetIds
    })
    await this.notifyAssigned(body.assistantId, task.id)
    return toTaskRes(task)
  }

  async createBatch(mangakaId: string, body: BatchCreateTaskBodyType) {
    const pages = await Promise.all(body.items.map((item) => this.validateAssign(mangakaId, item)))
    for (let index = 0; index < body.items.length; index++) {
      const item = body.items[index]
      await this.validateStageBinding(pages[index].chapterId, item.pageId, item.stageId, item.taskType)
    }
    const tasks = await this.taskRepository.createTasksBatch(
      body.items.map((b) => ({
        pageId: b.pageId,
        regionIds: b.regionId ? [b.regionId] : [],
        assistantId: b.assistantId,
        taskType: b.taskType,
        stageId: b.stageId,
        description: b.description,
        deadline: b.deadline ? new Date(b.deadline) : null,
        priority: b.priority,
        assetIds: b.assetIds
      }))
    )
    for (const t of tasks) await this.notifyAssigned(t.assistantId as string, t.id)
    const limit = 20
    const offset = 0
    return { items: tasks.map(toTaskRes), total: tasks.length, limit, offset }
  }

  // Task group: một đầu việc trải nhiều trang. Dưới DB vẫn là N task 1-trang dùng chung groupId
  // ⇒ giữ nguyên region / pagesReady / cascade / duyệt-từng-trang. Group chỉ để gom hiển thị + thao tác hàng loạt.
  async createGroup(mangakaId: string, body: CreateTaskGroupBodyType) {
    const pageIds = [...new Set(body.pageIds)]
    // Validate TOÀN BỘ trước khi ghi (all-or-nothing, mẫu createBatch)
    const pages = await Promise.all(
      pageIds.map((pageId) =>
        this.validateAssign(mangakaId, {
          pageId,
          assistantId: body.assistantId,
          assetIds: body.assetIds
        })
      )
    )
    for (let index = 0; index < pageIds.length; index++) {
      await this.validateStageBinding(pages[index].chapterId, pageIds[index], body.stageId, body.taskType)
    }

    const groupId = randomUUID()
    const tasks = await this.taskRepository.createTasksBatch(
      pageIds.map((pageId) => ({
        pageId,
        regionIds: [],
        assistantId: body.assistantId,
        taskType: body.taskType,
        stageId: body.stageId,
        description: body.description,
        deadline: body.deadline ? new Date(body.deadline) : null,
        priority: body.priority,
        assetIds: body.assetIds,
        groupId,
        groupTitle: body.groupTitle ?? null
      }))
    )
    for (const task of tasks) await this.notifyAssigned(task.assistantId as string, task.id)
    return {
      groupId,
      groupTitle: body.groupTitle ?? null,
      items: tasks.map(toTaskRes),
      total: tasks.length
    }
  }

  async reassign(mangakaId: string, taskId: string, body: ReassignTaskBodyType) {
    if (!OBJECT_ID_RE.test(taskId)) throw TaskNotFoundException
    const task = await this.taskRepository.findTaskById(taskId)
    if (!task) throw TaskNotFoundException
    await this.requirePageOwner(mangakaId, task.pageId)
    if (!REASSIGNABLE_TASK_STATUSES.includes(task.status)) throw TaskNotReassignableException
    const previousAssistantId = task.assistantId
    const active = await this.studioAssignmentService.findActiveForPair(mangakaId, body.assistantId)
    if (!active) throw AssistantNotHiredException
    await this.taskRepository.setAssistant(taskId, body.assistantId)
    if (task.status !== TaskStatus.ASSIGNED) {
      await this.taskStateService.transition(taskId, TaskStatus.ASSIGNED, TaskMessages.reason.reassigned, mangakaId)
    }
    const updated = await this.taskRepository.findTaskById(taskId)
    if (!updated) throw TaskNotFoundException
    if (previousAssistantId && previousAssistantId !== body.assistantId) {
      await this.notificationService.notifySafe({
        recipientId: previousAssistantId,
        type: NotificationType.TASK,
        referenceId: taskId,
        referenceType: 'TASK_REASSIGNED',
        content: TaskMessages.notification.taskReassigned
      })
    }
    await this.notifyAssigned(body.assistantId, taskId)
    return toTaskRes(updated)
  }

  async cancel(mangakaId: string, taskId: string, body: CancelTaskBodyType) {
    if (!OBJECT_ID_RE.test(taskId)) throw TaskNotFoundException
    const task = await this.taskRepository.findTaskById(taskId)
    if (!task) throw TaskNotFoundException
    await this.requirePageOwner(mangakaId, task.pageId, { checkHold: false })
    if (!CANCELABLE_TASK_STATUSES.includes(task.status)) throw TaskNotCancellableException
    await this.taskStateService.transition(
      taskId,
      TaskStatus.CANCELLED,
      body.reason ?? TaskMessages.reason.cancelledByMangaka,
      mangakaId
    )
    if (task.assistantId) {
      await this.notificationService.notifySafe({
        recipientId: task.assistantId,
        type: NotificationType.TASK,
        referenceId: taskId,
        referenceType: 'TASK_CANCELLED',
        content: TaskMessages.notification.taskCancelled
      })
    }
    const updated = await this.taskRepository.findTaskById(taskId)
    if (!updated) throw TaskNotFoundException
    return toTaskRes(updated)
  }

  async update(mangakaId: string, taskId: string, body: import('../schemas/task-schemas').UpdateTaskBodyType) {
    if (!OBJECT_ID_RE.test(taskId)) throw TaskNotFoundException
    const task = await this.taskRepository.findTaskById(taskId)
    if (!task) throw TaskNotFoundException
    await this.requirePageOwner(mangakaId, task.pageId)
    const data: { assetIds?: string[]; description?: string; deadline?: Date | null; priority?: number } = {}
    if (body.assetIds != null) {
      if (body.assetIds.length > 0) {
        const found = await this.storageRepository.findAssetsByIds(body.assetIds)
        if (found.length !== body.assetIds.length) throw AssetNotFoundException
      }
      data.assetIds = body.assetIds
    }
    if (body.description != null) {
      if (task.status !== TaskStatus.ASSIGNED) throw TaskDescriptionLockedException
      data.description = body.description
    }
    if (body.deadline != null) data.deadline = new Date(body.deadline)
    if (body.priority != null) data.priority = body.priority
    if (Object.keys(data).length === 0) return toTaskRes(task)
    const updated = await this.taskRepository.updateTaskFields(taskId, data)
    return toTaskRes(updated)
  }
}
