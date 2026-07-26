import { Injectable } from '@nestjs/common'
import {
  BatchCreateTaskBodyType,
  CancelTaskBodyType,
  CreateTaskBodyType,
  CreateTaskGroupBodyType,
  ReassignTaskBodyType,
  UpdateTaskBodyType
} from '../schemas/task-schemas'
import { TaskAssignmentCreateService } from './task-assignment-create.service'
import { TaskAssignmentMutationService } from './task-assignment-mutation.service'

@Injectable()
export class TaskAssignService {
  constructor(
    private readonly createService: TaskAssignmentCreateService,
    private readonly mutationService: TaskAssignmentMutationService
  ) {}

  create(mangakaId: string, body: CreateTaskBodyType) {
    return this.createService.create(mangakaId, body)
  }
  createBatch(mangakaId: string, body: BatchCreateTaskBodyType) {
    return this.createService.createBatch(mangakaId, body)
  }
  createGroup(mangakaId: string, body: CreateTaskGroupBodyType) {
    return this.createService.createGroup(mangakaId, body)
  }
  reassign(mangakaId: string, taskId: string, body: ReassignTaskBodyType) {
    return this.mutationService.reassign(mangakaId, taskId, body)
  }
  cancel(mangakaId: string, taskId: string, body: CancelTaskBodyType) {
    return this.mutationService.cancel(mangakaId, taskId, body)
  }
  update(mangakaId: string, taskId: string, body: UpdateTaskBodyType) {
    return this.mutationService.update(mangakaId, taskId, body)
  }
}
