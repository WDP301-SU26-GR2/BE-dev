import { Injectable } from '@nestjs/common'
import { NotificationType, TaskStatus } from '@prisma/client'
import { isObjectId } from 'src/core/http/schemas/object-id.schema'
import { NotificationService } from 'src/modules/notification/notification.service'
import { StudioAssignmentService } from 'src/modules/studio/services/studio-assignment.service'
import {
  AssetNotFoundException,
  AssistantNotHiredException,
  TaskDescriptionLockedException,
  TaskNotCancellableException,
  TaskNotFoundException,
  TaskNotReassignableException
} from '../errors/task.errors'
import { TaskAssetQueryPort } from '../ports/task-asset-query.port'
import { CancelTaskBodyType, ReassignTaskBodyType, UpdateTaskBodyType } from '../schemas/task-schemas'
import { CANCELABLE_TASK_STATUSES, REASSIGNABLE_TASK_STATUSES } from '../task.constant'
import { toTaskRes } from '../task.mapper'
import { TaskMessages } from '../task.messages'
import { TaskRepository } from '../task.repo'
import { TaskAssignmentValidatorService } from './task-assignment-validator.service'
import { TaskStateService } from './task-state.service'

@Injectable()
export class TaskAssignmentMutationService {
  constructor(
    private readonly taskRepository: TaskRepository,
    private readonly validator: TaskAssignmentValidatorService,
    private readonly studioAssignmentService: StudioAssignmentService,
    private readonly taskStateService: TaskStateService,
    private readonly notificationService: NotificationService,
    private readonly taskAssetQuery: TaskAssetQueryPort
  ) {}

  async reassign(mangakaId: string, taskId: string, body: ReassignTaskBodyType) {
    const task = await this.loadTask(taskId)
    await this.validator.requirePageOwner(mangakaId, task.pageId)
    if (!REASSIGNABLE_TASK_STATUSES.includes(task.status)) throw TaskNotReassignableException
    if (!(await this.studioAssignmentService.findActiveForPair(mangakaId, body.assistantId))) {
      throw AssistantNotHiredException
    }
    const previousAssistantId = task.assistantId
    await this.taskRepository.setAssistant(taskId, body.assistantId)
    if (task.status !== TaskStatus.ASSIGNED) {
      await this.taskStateService.transition(taskId, TaskStatus.ASSIGNED, TaskMessages.reason.reassigned, mangakaId)
    }
    const updated = await this.loadTask(taskId)
    if (previousAssistantId && previousAssistantId !== body.assistantId) {
      await this.notify(previousAssistantId, taskId, 'TASK_REASSIGNED', TaskMessages.notification.taskReassigned)
    }
    await this.notify(body.assistantId, taskId, 'TASK_ASSIGNED', TaskMessages.notification.taskAssigned)
    return toTaskRes(updated)
  }

  async cancel(mangakaId: string, taskId: string, body: CancelTaskBodyType) {
    const task = await this.loadTask(taskId)
    await this.validator.requirePageOwner(mangakaId, task.pageId, { checkHold: false })
    if (!CANCELABLE_TASK_STATUSES.includes(task.status)) throw TaskNotCancellableException
    await this.taskStateService.transition(
      taskId,
      TaskStatus.CANCELLED,
      body.reason ?? TaskMessages.reason.cancelledByMangaka,
      mangakaId
    )
    if (task.assistantId) {
      await this.notify(task.assistantId, taskId, 'TASK_CANCELLED', TaskMessages.notification.taskCancelled)
    }
    return toTaskRes(await this.loadTask(taskId))
  }

  async update(mangakaId: string, taskId: string, body: UpdateTaskBodyType) {
    const task = await this.loadTask(taskId)
    await this.validator.requirePageOwner(mangakaId, task.pageId)
    const data: { assetIds?: string[]; description?: string; deadline?: Date | null; priority?: number } = {}
    if (body.assetIds != null) {
      if (body.assetIds.length > 0) {
        const found = await this.taskAssetQuery.findExistingAssetIds(body.assetIds)
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
    return toTaskRes(await this.taskRepository.updateTaskFields(taskId, data))
  }

  private async loadTask(taskId: string) {
    if (!isObjectId(taskId)) throw TaskNotFoundException
    const task = await this.taskRepository.findTaskById(taskId)
    if (!task) throw TaskNotFoundException
    return task
  }

  private notify(recipientId: string, taskId: string, referenceType: string, content: string) {
    return this.notificationService.notifySafe({
      recipientId,
      type: NotificationType.TASK,
      referenceId: taskId,
      referenceType,
      content
    })
  }
}
