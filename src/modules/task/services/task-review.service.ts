import { Injectable } from '@nestjs/common'
import { NotificationType } from '@prisma/client'
import { NotificationService } from 'src/modules/notification/notification.service'
import {
  NotSeriesOwnerException,
  NotTaskAssigneeException,
  PageNotFoundException,
  TaskNotFoundException
} from '../errors/task.errors'
import { TaskRepository } from '../task.repo'
import { TaskStateService } from './task-state.service'
import { TaskCascadeService } from './task-cascade.service'
import { toTaskRes } from '../task.mapper'
import { RequestRevisionBodyType, SubmitTaskBodyType } from '../schemas/task-schemas'
import { TaskMessages } from '../task.messages'

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/

@Injectable()
export class TaskReviewService {
  constructor(
    private readonly taskRepository: TaskRepository,
    private readonly taskStateService: TaskStateService,
    private readonly taskCascadeService: TaskCascadeService,
    private readonly notificationService: NotificationService
  ) {}

  private async requireTask(taskId: string) {
    if (!OBJECT_ID_RE.test(taskId)) throw TaskNotFoundException
    const task = await this.taskRepository.findTaskById(taskId)
    if (!task) throw TaskNotFoundException
    return task
  }

  private async requireOwner(mangakaId: string, pageId: string) {
    const page = await this.taskRepository.findPageWithOwner(pageId)
    if (!page) throw PageNotFoundException
    if (page.chapter.series.mangakaId !== mangakaId) throw NotSeriesOwnerException
    return page
  }

  private async notify(
    recipientId: string,
    type: NotificationType,
    referenceType: string,
    taskId: string,
    content: string
  ) {
    await this.notificationService.notifySafe({
      recipientId,
      type,
      referenceId: taskId,
      referenceType,
      content
    })
  }

  // A-TSK-04 / SRS §2.2a bước 2: Assistant "Bắt đầu" → ASSIGNED → IN_PROGRESS (ghi mốc bắt đầu).
  // Cửa duy nhất rời ASSIGNED sang luồng làm việc; submit chỉ đi từ IN_PROGRESS/REVISION_REQUESTED.
  async start(assistantId: string, taskId: string) {
    const task = await this.requireTask(taskId)
    if (task.assistantId !== assistantId) throw NotTaskAssigneeException
    await this.taskStateService.transition(taskId, 'IN_PROGRESS')
    const updated = await this.taskRepository.findTaskById(taskId)
    if (!updated) throw TaskNotFoundException
    return toTaskRes(updated)
  }

  async submit(assistantId: string, taskId: string, body: SubmitTaskBodyType) {
    const task = await this.requireTask(taskId)
    if (task.assistantId !== assistantId) throw NotTaskAssigneeException
    await this.taskStateService.transition(taskId, 'SUBMITTED')
    const versionNumber = (task.versions?.length ?? 0) + 1
    await this.taskRepository.pushTaskVersion(taskId, { submittedBy: assistantId, versionNumber, file: body.file })
    const updated = await this.taskRepository.findTaskById(taskId)
    if (!updated) throw TaskNotFoundException
    await this.taskCascadeService.fireOnSubmitted(updated, updated.assistantId ?? assistantId)
    const page = await this.taskRepository.findPageWithOwner(task.pageId)
    if (page)
      await this.notify(
        page.chapter.series.mangakaId,
        NotificationType.REVIEW,
        'TASK_SUBMITTED',
        taskId,
        TaskMessages.notification.taskSubmittedForReview
      )
    return toTaskRes(updated)
  }

  async approve(mangakaId: string, taskId: string) {
    const task = await this.requireTask(taskId)
    await this.requireOwner(mangakaId, task.pageId)
    await this.taskStateService.transition(taskId, 'UNDER_REVIEW')
    await this.taskStateService.transition(taskId, 'APPROVED')
    await this.taskRepository.setLatestVersionReview(taskId, { reviewStatus: 'APPROVED', reviewerNote: null })
    const updated = await this.taskRepository.findTaskById(taskId)
    if (!updated) throw TaskNotFoundException
    if (updated.assistantId) {
      await this.notify(
        updated.assistantId,
        NotificationType.TASK,
        'TASK_APPROVED',
        taskId,
        TaskMessages.notification.taskApproved
      )
    }
    return toTaskRes(updated)
  }

  async requestRevision(mangakaId: string, taskId: string, body: RequestRevisionBodyType) {
    const task = await this.requireTask(taskId)
    await this.requireOwner(mangakaId, task.pageId)
    await this.taskStateService.transition(taskId, 'UNDER_REVIEW')
    await this.taskStateService.transition(taskId, 'REVISION_REQUESTED')
    // Prisma enum TaskVersionReviewStatus: PENDING | APPROVED | REVISION_REQUESTED.
    await this.taskRepository.setLatestVersionReview(taskId, {
      reviewStatus: 'REVISION_REQUESTED',
      reviewerNote: body.reviewerNote
    })
    const updated = await this.taskRepository.findTaskById(taskId)
    if (!updated) throw TaskNotFoundException
    if (updated.assistantId) {
      await this.notify(
        updated.assistantId,
        NotificationType.TASK,
        'TASK_REVISION_REQUESTED',
        taskId,
        TaskMessages.notification.taskRevisionRequested
      )
    }
    return toTaskRes(updated)
  }
}
