import { randomUUID } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { NotificationType, TaskStatus } from '@prisma/client'
import { NotificationService } from 'src/modules/notification/notification.service'
import { PAGE_EDITABLE_STATUSES } from 'src/modules/chapter/chapter.constant'
import { StudioAssignmentService } from 'src/modules/studio/services/studio-assignment.service'
import { StorageRepository } from 'src/modules/storage/storage.repo'
import {
  AssetNotFoundException,
  AssistantNotHiredException,
  ChapterOnHoldTaskException,
  NotSeriesOwnerException,
  PageNotEditableTaskException,
  PageNotFoundException,
  TaskNotFoundException,
  TaskNotCancellableException,
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
    private readonly notificationService: NotificationService
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

  private async validateAssign(mangakaId: string, body: CreateTaskBodyType) {
    await this.requirePageOwner(mangakaId, body.pageId)
    const active = await this.studioAssignmentService.findActiveForPair(mangakaId, body.assistantId)
    if (!active) throw AssistantNotHiredException
    if (body.assetIds.length > 0) {
      const found = await this.storageRepository.findAssetsByIds(body.assetIds)
      if (found.length !== body.assetIds.length) throw AssetNotFoundException
    }
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
    await this.validateAssign(mangakaId, body)
    const task = await this.taskRepository.createTask({
      pageId: body.pageId,
      regionId: body.regionId ?? null,
      assistantId: body.assistantId,
      taskType: body.taskType,
      deadline: body.deadline ? new Date(body.deadline) : null,
      priority: body.priority,
      assetIds: body.assetIds
    })
    await this.notifyAssigned(body.assistantId, task.id)
    return toTaskRes(task)
  }

  async createBatch(mangakaId: string, body: BatchCreateTaskBodyType) {
    for (const item of body.items) await this.validateAssign(mangakaId, item)
    const tasks = await this.taskRepository.createTasksBatch(
      body.items.map((b) => ({
        pageId: b.pageId,
        regionId: b.regionId ?? null,
        assistantId: b.assistantId,
        taskType: b.taskType,
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
    for (const pageId of pageIds) {
      await this.validateAssign(mangakaId, {
        pageId,
        assistantId: body.assistantId,
        taskType: body.taskType,
        priority: body.priority,
        assetIds: body.assetIds
      })
    }

    const groupId = randomUUID()
    const tasks = await this.taskRepository.createTasksBatch(
      pageIds.map((pageId) => ({
        pageId,
        regionId: null,
        assistantId: body.assistantId,
        taskType: body.taskType,
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
    const data: { assetIds?: string[]; deadline?: Date | null; priority?: number } = {}
    if (body.assetIds != null) {
      if (body.assetIds.length > 0) {
        const found = await this.storageRepository.findAssetsByIds(body.assetIds)
        if (found.length !== body.assetIds.length) throw AssetNotFoundException
      }
      data.assetIds = body.assetIds
    }
    if (body.deadline != null) data.deadline = new Date(body.deadline)
    if (body.priority != null) data.priority = body.priority
    const updated = await this.taskRepository.updateTaskFields(taskId, data)
    return toTaskRes(updated)
  }
}
