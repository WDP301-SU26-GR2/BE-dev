import { randomUUID } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { NotificationType } from '@prisma/client'
import { NotificationService } from 'src/modules/notification/notification.service'
import { toTaskRes } from '../task.mapper'
import { TaskRepository } from '../task.repo'
import { BatchCreateTaskBodyType, CreateTaskBodyType, CreateTaskGroupBodyType } from '../schemas/task-schemas'
import { TaskMessages } from '../task.messages'
import { TaskAssignmentValidatorService } from './task-assignment-validator.service'

@Injectable()
export class TaskAssignmentCreateService {
  constructor(
    private readonly taskRepository: TaskRepository,
    private readonly validator: TaskAssignmentValidatorService,
    private readonly notificationService: NotificationService
  ) {}

  async create(mangakaId: string, body: CreateTaskBodyType) {
    const page = await this.validator.validateAssign(mangakaId, body)
    await this.validator.validateStageBinding(page.chapterId, body.pageId, body.stageId, body.taskType)
    const regionIds = await this.validator.resolveRegionIds(body.pageId, body.regionIds)
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
    const pages = await Promise.all(body.items.map((item) => this.validator.validateAssign(mangakaId, item)))
    for (let index = 0; index < body.items.length; index++) {
      const item = body.items[index]
      await this.validator.validateStageBinding(pages[index].chapterId, item.pageId, item.stageId, item.taskType)
    }
    const tasks = await this.taskRepository.createTasksBatch(
      body.items.map((item) => ({
        pageId: item.pageId,
        regionIds: item.regionId ? [item.regionId] : [],
        assistantId: item.assistantId,
        taskType: item.taskType,
        stageId: item.stageId,
        description: item.description,
        deadline: item.deadline ? new Date(item.deadline) : null,
        priority: item.priority,
        assetIds: item.assetIds
      }))
    )
    for (const task of tasks) await this.notifyAssigned(task.assistantId as string, task.id)
    return { items: tasks.map(toTaskRes), total: tasks.length, limit: 20, offset: 0 }
  }

  async createGroup(mangakaId: string, body: CreateTaskGroupBodyType) {
    const pageIds = [...new Set(body.pageIds)]
    const pages = await Promise.all(
      pageIds.map((pageId) =>
        this.validator.validateAssign(mangakaId, {
          pageId,
          assistantId: body.assistantId,
          assetIds: body.assetIds
        })
      )
    )
    for (let index = 0; index < pageIds.length; index++) {
      await this.validator.validateStageBinding(pages[index].chapterId, pageIds[index], body.stageId, body.taskType)
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
    return { groupId, groupTitle: body.groupTitle ?? null, items: tasks.map(toTaskRes), total: tasks.length }
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
}
