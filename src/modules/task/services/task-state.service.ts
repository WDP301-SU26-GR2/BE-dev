import { Injectable } from '@nestjs/common'
import { AuditEntityType, TaskStatus } from '@prisma/client'
import { AuditService } from 'src/modules/audit/audit.service'
import { TASK_TRANSITIONS } from '../task.constant'
import { InvalidTaskTransitionException, TaskNotFoundException } from '../errors/task.errors'
import { TaskRepository } from '../task.repo'
import { TaskMessages } from '../task.messages'

@Injectable()
export class TaskStateService {
  constructor(
    private readonly taskRepository: TaskRepository,
    private readonly auditService: AuditService
  ) {}

  async transition(taskId: string, to: TaskStatus, statusReason?: string, actorId?: string | null) {
    const task = await this.taskRepository.findTaskById(taskId)
    if (!task) throw TaskNotFoundException
    const allowed = TASK_TRANSITIONS[task.status] ?? []
    if (!allowed.includes(to)) throw InvalidTaskTransitionException
    const updated = await this.taskRepository.updateTaskStatus(taskId, to, statusReason)
    await this.auditService.record({
      actorId: actorId ?? null,
      entityType: AuditEntityType.TASK,
      entityId: taskId,
      action: 'TRANSITION',
      fromState: task.status,
      toState: to,
      reason: statusReason
    })
    return updated
  }

  async cancelRegionTasksAndDeleteRegion(regionId: string, taskIds: string[]): Promise<void> {
    await this.taskRepository.cancelTasksAndDeleteRegion(regionId, taskIds, TaskMessages.reason.regionDeleted)
  }
}
