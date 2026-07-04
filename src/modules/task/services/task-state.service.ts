import { Injectable } from '@nestjs/common'
import { TaskStatus } from '@prisma/client'
import { TASK_TRANSITIONS } from '../task.constant'
import { InvalidTaskTransitionException, TaskNotFoundException } from '../errors/task.errors'
import { TaskRepository } from '../task.repo'
import { TaskMessages } from '../task.messages'

@Injectable()
export class TaskStateService {
  constructor(private readonly taskRepository: TaskRepository) {}

  async transition(taskId: string, to: TaskStatus, statusReason?: string) {
    const task = await this.taskRepository.findTaskById(taskId)
    if (!task) throw TaskNotFoundException
    const allowed = TASK_TRANSITIONS[task.status] ?? []
    if (!allowed.includes(to)) throw InvalidTaskTransitionException
    return this.taskRepository.updateTaskStatus(taskId, to, statusReason)
  }

  async cancelRegionTasksAndDeleteRegion(regionId: string, taskIds: string[]): Promise<void> {
    await this.taskRepository.cancelTasksAndDeleteRegion(regionId, taskIds, TaskMessages.reason.regionDeleted)
  }
}
