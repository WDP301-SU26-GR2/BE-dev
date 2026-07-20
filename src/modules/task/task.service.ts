import { Injectable } from '@nestjs/common'
import { RoleName } from 'src/core/security/constants/role.constant'
import { RegionService } from './services/region.service'
import { TaskAssignService } from './services/task-assign.service'
import { TaskReviewService } from './services/task-review.service'
import { TaskRepository, TaskListWhere } from './task.repo'
import { toTaskRes } from './task.mapper'
import {
  BatchCreateTaskBodyType,
  CreateTaskGroupBodyType,
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

  createTaskGroup(userId: string, body: CreateTaskGroupBodyType) {
    return this.taskAssignService.createGroup(userId, body)
  }

  approveTaskGroup(userId: string, groupId: string) {
    return this.taskReviewService.approveGroup(userId, groupId)
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
    const empty = { items: [], total: 0, limit: query.limit, offset: query.offset }
    const ids = [query.pageId, query.regionId, query.assistantId, query.seriesId, query.chapterId]
    if (ids.some((id) => id != null && !OBJECT_ID_RE.test(id))) return empty

    const isAssistant = roleName === RoleName.ASSISTANT
    const scopeFilters: { seriesId?: string; chapterId?: string } = {
      ...(query.seriesId ? { seriesId: query.seriesId } : {}),
      ...(query.chapterId ? { chapterId: query.chapterId } : {})
    }

    let pageScope: TaskListWhere['pageId']
    if (query.pageId) {
      // Đường cũ: chốt đúng 1 trang. Mangaka phải sở hữu trang đó.
      if (!isAssistant) {
        const owned = await this.taskRepository.findPageWithOwner(query.pageId)
        if (!owned || owned.chapter.series.mangakaId !== userId) return empty
      }
      pageScope = query.pageId
    } else if (isAssistant) {
      // Assistant vốn đã bị giới hạn theo assistantId; series/chapter chỉ là bộ lọc, KHÔNG phải authz.
      if (Object.keys(scopeFilters).length === 0) pageScope = undefined
      else {
        const pageIds = await this.taskRepository.findOwnedPageIds(undefined, scopeFilters)
        if (pageIds.length === 0) return empty
        pageScope = { in: pageIds }
      }
    } else {
      // Mangaka: mặc định TOÀN BỘ trang thuộc series mình sở hữu (không cần bám flow page).
      const pageIds = await this.taskRepository.findOwnedPageIds(userId, scopeFilters)
      if (pageIds.length === 0) return empty
      pageScope = { in: pageIds }
    }

    const where: TaskListWhere = {
      ...(isAssistant ? { assistantId: userId } : {}),
      ...(pageScope !== undefined ? { pageId: pageScope } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.regionId ? { regionId: query.regionId } : {}),
      ...(query.groupId ? { groupId: query.groupId } : {}),
      ...(!isAssistant && query.assistantId ? { assistantId: query.assistantId } : {})
    }

    const page = { limit: query.limit, offset: query.offset }
    const [rows, total] = await Promise.all([
      this.taskRepository.listTasks(where, page),
      this.taskRepository.countTasks(where)
    ])
    return { items: rows.map(toTaskRes), total, limit: query.limit, offset: query.offset }
  }
}
