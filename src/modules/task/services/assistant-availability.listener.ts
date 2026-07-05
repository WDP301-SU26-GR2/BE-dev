import { Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { DomainEvent, DomainEventPayload } from 'src/core/events/domain-events'
import { ON_HOLD_SOURCE_STATUSES } from '../task.constant'
import { TaskRepository } from '../task.repo'
import { TaskStateService } from './task-state.service'

@Injectable()
export class AssistantAvailabilityListener {
  private readonly logger = new Logger(AssistantAvailabilityListener.name)

  constructor(
    private readonly taskRepository: TaskRepository,
    private readonly taskStateService: TaskStateService
  ) {}

  @OnEvent(DomainEvent.AssistantAvailabilityChanged)
  async handle(payload: DomainEventPayload[typeof DomainEvent.AssistantAvailabilityChanged]) {
    if (payload.availabilityStatus !== 'ON_LEAVE' && payload.availabilityStatus !== 'UNAVAILABLE') return
    const tasks = await this.taskRepository.findTasksByAssistantInStatuses(payload.assistantId, ON_HOLD_SOURCE_STATUSES)
    for (const task of tasks) {
      try {
        await this.taskStateService.transition(task.id, 'ON_HOLD', undefined, null)
      } catch (error) {
        this.logger.warn(`Failed to hold task ${task.id} on assistant leave: ${String(error)}`)
      }
    }
  }
}
