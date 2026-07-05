import { Injectable } from '@nestjs/common'
import { RoleName } from 'src/core/security/constants/role.constant'
import { RegionService } from './services/region.service'
import { TaskAssignService } from './services/task-assign.service'
import { TaskReviewService } from './services/task-review.service'
import { TaskRepository, TaskListWhere } from './task.repo'
import { toTaskRes } from './task.mapper'
import {
  BatchCreateTaskBodyType,
  CancelTaskBodyType,
  CreateRegionBodyType,
  CreateTaskBodyType,
  ListTasksQueryType,
  ReassignTaskBodyType,
  RequestRevisionBodyType,
  SubmitTaskBodyType,
  UpdateRegionBodyType,
  UpdateTaskBodyType
} from './schemas/task-schemas'
import { TaskNotFoundException } from './errors/task.errors'

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/

@Injectable()
export class TaskService {
  constructor(
    private readonly regionService: RegionService,
    private readonly taskAssignService: TaskAssignService,
    private readonly taskReviewService: TaskReviewService,
    private readonly taskRepository: TaskRepository
  ) {}

  // Region
  createRegion(userId: string, pageId: string, body: CreateRegionBodyType) {
    return this.regionService.create(userId, pageId, body)
  }
  listRegions(userId: string, pageId: string) {
    return this.regionService.listByPage(userId, pageId)
  }
  updateRegion(userId: string, id: string, body: UpdateRegionBodyType) {
    return this.regionService.update(userId, id, body)
  }
  removeRegion(userId: string, id: string) {
    return this.regionService.remove(userId, id)
  }

  // Task assign
  createTask(userId: string, body: CreateTaskBodyType) {
    return this.taskAssignService.create(userId, body)
  }
  createTaskBatch(userId: string, body: BatchCreateTaskBodyType) {
    return this.taskAssignService.createBatch(userId, body)
  }
  reassignTask(userId: string, id: string, body: ReassignTaskBodyType) {
    return this.taskAssignService.reassign(userId, id, body)
  }
  cancelTask(userId: string, id: string, body: CancelTaskBodyType) {
    return this.taskAssignService.cancel(userId, id, body)
  }
  updateTask(userId: string, id: string, body: UpdateTaskBodyType) {
    return this.taskAssignService.update(userId, id, body)
  }

  // Task review
  startTask(userId: string, id: string) {
    return this.taskReviewService.start(userId, id)
  }
  submitTask(userId: string, id: string, body: SubmitTaskBodyType) {
    return this.taskReviewService.submit(userId, id, body)
  }
  approveTask(userId: string, id: string) {
    return this.taskReviewService.approve(userId, id)
  }
  requestRevision(userId: string, id: string, body: RequestRevisionBodyType) {
    return this.taskReviewService.requestRevision(userId, id, body)
  }

  // Reads
  async getTask(userId: string, roleName: string, id: string) {
    if (!OBJECT_ID_RE.test(id)) throw TaskNotFoundException
    const task = await this.taskRepository.findTaskById(id)
    if (!task) throw TaskNotFoundException
    if (roleName === RoleName.ASSISTANT) {
      if (task.assistantId !== userId) throw TaskNotFoundException
    } else {
      const page = await this.taskRepository.findPageWithOwner(task.pageId)
      if (!page || page.chapter.series.mangakaId !== userId) throw TaskNotFoundException
    }
    return toTaskRes(task)
  }

  async listTasks(userId: string, roleName: string, query: ListTasksQueryType) {
    let where: TaskListWhere
    if (roleName === RoleName.ASSISTANT) {
      if (query.pageId && !OBJECT_ID_RE.test(query.pageId))
        return { items: [], total: 0, limit: query.limit, offset: query.offset }
      if (query.regionId && !OBJECT_ID_RE.test(query.regionId))
        return { items: [], total: 0, limit: query.limit, offset: query.offset }
      where = {
        assistantId: userId,
        ...(query.status ? { status: query.status } : {}),
        ...(query.pageId ? { pageId: query.pageId } : {}),
        ...(query.regionId ? { regionId: query.regionId } : {})
      }
    } else {
      // MANGAKA: bắt buộc pageId thuộc sở hữu; thiếu/không sở hữu → rỗng
      if (!query.pageId || !OBJECT_ID_RE.test(query.pageId))
        return { items: [], total: 0, limit: query.limit, offset: query.offset }
      if (query.regionId && !OBJECT_ID_RE.test(query.regionId))
        return { items: [], total: 0, limit: query.limit, offset: query.offset }
      if (query.assistantId && !OBJECT_ID_RE.test(query.assistantId))
        return { items: [], total: 0, limit: query.limit, offset: query.offset }
      const page = await this.taskRepository.findPageWithOwner(query.pageId)
      if (!page || page.chapter.series.mangakaId !== userId)
        return { items: [], total: 0, limit: query.limit, offset: query.offset }
      where = {
        pageId: query.pageId,
        ...(query.status ? { status: query.status } : {}),
        ...(query.assistantId ? { assistantId: query.assistantId } : {}),
        ...(query.regionId ? { regionId: query.regionId } : {})
      }
    }
    const page = { limit: query.limit, offset: query.offset }
    const [rows, total] = await Promise.all([
      this.taskRepository.listTasks(where, page),
      this.taskRepository.countTasks(where)
    ])
    return { items: rows.map(toTaskRes), total, limit: query.limit, offset: query.offset }
  }
}
