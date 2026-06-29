import { Injectable, Logger } from '@nestjs/common'
import { NotificationType } from '@prisma/client'
import { NotificationService } from 'src/modules/notification/notification.service'
import { StudioAssignmentService } from 'src/modules/studio/services/studio-assignment.service'
import { StorageRepository } from 'src/modules/storage/storage.repo'
import {
  AssetNotFoundException,
  AssistantNotHiredException,
  NotSeriesOwnerException,
  PageNotFoundException,
  TaskNotFoundException,
  TaskNotReassignableException
} from '../errors/task.errors'
import { TaskRepository } from '../task.repo'
import { TaskStateService } from './task-state.service'
import { toTaskRes } from '../task.mapper'
import { BatchCreateTaskBodyType, CreateTaskBodyType, ReassignTaskBodyType } from '../schemas/task-schemas'

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/

@Injectable()
export class TaskAssignService {
  private readonly logger = new Logger(TaskAssignService.name)

  constructor(
    private readonly taskRepository: TaskRepository,
    private readonly studioAssignmentService: StudioAssignmentService,
    private readonly storageRepository: StorageRepository,
    private readonly taskStateService: TaskStateService,
    private readonly notificationService: NotificationService
  ) {}

  private async requirePageOwner(mangakaId: string, pageId: string) {
    if (!OBJECT_ID_RE.test(pageId)) throw PageNotFoundException
    const page = await this.taskRepository.findPageWithOwner(pageId)
    if (!page) throw PageNotFoundException
    if (page.chapter.series.mangakaId !== mangakaId) throw NotSeriesOwnerException
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
    try {
      await this.notificationService.notify({
        recipientId: assistantId,
        type: NotificationType.TASK,
        referenceId: taskId,
        referenceType: 'TASK',
        content: null
      })
    } catch (error) {
      this.logger.warn(`Failed to notify task assigned ${taskId}: ${String(error)}`)
    }
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

  async reassign(mangakaId: string, taskId: string, body: ReassignTaskBodyType) {
    if (!OBJECT_ID_RE.test(taskId)) throw TaskNotFoundException
    const task = await this.taskRepository.findTaskById(taskId)
    if (!task) throw TaskNotFoundException
    await this.requirePageOwner(mangakaId, task.pageId)
    if (task.status !== 'ON_HOLD') throw TaskNotReassignableException
    const active = await this.studioAssignmentService.findActiveForPair(mangakaId, body.assistantId)
    if (!active) throw AssistantNotHiredException
    await this.taskRepository.setAssistant(taskId, body.assistantId)
    await this.taskStateService.transition(taskId, 'ASSIGNED')
    const updated = await this.taskRepository.findTaskById(taskId)
    if (!updated) throw TaskNotFoundException
    await this.notifyAssigned(body.assistantId, taskId)
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