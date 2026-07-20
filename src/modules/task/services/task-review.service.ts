import { Injectable } from '@nestjs/common'
import { NotificationType, RevisionTargetType } from '@prisma/client'
import { NotificationService } from 'src/modules/notification/notification.service'
import { PAGE_EDITABLE_STATUSES } from 'src/modules/chapter/chapter.constant'
import { RevisionService } from 'src/modules/revision/revision.service'
import {
  ChapterOnHoldTaskException,
  NotSeriesOwnerException,
  NotTaskAssigneeException,
  PageNotEditableTaskException,
  PageNotFoundException,
  TaskNotFoundException
} from '../errors/task.errors'
import { TaskRepository } from '../task.repo'
import { TaskStateService } from './task-state.service'
import { toTaskRes } from '../task.mapper'
import { RequestRevisionBodyType, SubmitTaskBodyType } from '../schemas/task-schemas'
import { GROUP_APPROVABLE_TASK_STATUSES } from '../task.constant'
import { TaskMessages } from '../task.messages'

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/

@Injectable()
export class TaskReviewService {
  constructor(
    private readonly taskRepository: TaskRepository,
    private readonly taskStateService: TaskStateService,
    private readonly notificationService: NotificationService,
    private readonly revisionService: RevisionService
  ) {}

  private async requireTask(taskId: string) {
    if (!OBJECT_ID_RE.test(taskId)) throw TaskNotFoundException
    const task = await this.taskRepository.findTaskById(taskId)
    if (!task) throw TaskNotFoundException
    return task
  }

  private async requireEditablePage(pageId: string) {
    const page = await this.taskRepository.findPageWithOwner(pageId)
    if (!page) throw PageNotFoundException
    if (page.chapter.hold) throw ChapterOnHoldTaskException
    if (!PAGE_EDITABLE_STATUSES.includes(page.status)) throw PageNotEditableTaskException
    return page
  }

  private async requireOwner(mangakaId: string, pageId: string) {
    const page = await this.taskRepository.findPageWithOwner(pageId)
    if (!page) throw PageNotFoundException
    if (page.chapter.series.mangakaId !== mangakaId) throw NotSeriesOwnerException
    if (page.chapter.hold) throw ChapterOnHoldTaskException
    if (!PAGE_EDITABLE_STATUSES.includes(page.status)) throw PageNotEditableTaskException
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
    await this.requireEditablePage(task.pageId)
    await this.taskStateService.transition(taskId, 'IN_PROGRESS', undefined, assistantId)
    const updated = await this.taskRepository.findTaskById(taskId)
    if (!updated) throw TaskNotFoundException
    return toTaskRes(updated)
  }

  async submit(assistantId: string, taskId: string, body: SubmitTaskBodyType) {
    const task = await this.requireTask(taskId)
    if (task.assistantId !== assistantId) throw NotTaskAssigneeException
    const page = await this.requireEditablePage(task.pageId)
    await this.taskStateService.transition(taskId, 'SUBMITTED', undefined, assistantId)
    const versionNumber = (task.versions?.length ?? 0) + 1
    await this.taskRepository.pushTaskVersion(taskId, { submittedBy: assistantId, versionNumber, file: body.file })
    const updated = await this.taskRepository.findTaskById(taskId)
    if (!updated) throw TaskNotFoundException
    await this.notify(
      page.chapter.series.mangakaId,
      NotificationType.REVIEW,
      'TASK_SUBMITTED',
      taskId,
      TaskMessages.notification.taskSubmittedForReview(versionNumber)
    )
    return toTaskRes(updated)
  }

  // Duyệt cả nhóm việc. TÁI DÙNG approve() để không nhân đôi luật duyệt
  // (SUBMITTED→UNDER_REVIEW→APPROVED + ghi review vào version + notify trợ lý).
  // Task chưa tới lượt thì bỏ qua và báo lại — nhóm hiếm khi chín cùng lúc.
  async approveGroup(mangakaId: string, groupId: string) {
    const tasks = await this.taskRepository.findTasksByGroup(groupId)
    if (tasks.length === 0) throw TaskNotFoundException
    await this.requireOwner(mangakaId, tasks[0].pageId)

    const skipped: string[] = []
    let approved = 0
    for (const task of tasks) {
      if (!GROUP_APPROVABLE_TASK_STATUSES.includes(task.status)) {
        skipped.push(task.id)
        continue
      }
      await this.approve(mangakaId, task.id)
      approved++
    }
    return { groupId, approved, skipped }
  }

  async approve(mangakaId: string, taskId: string) {
    const task = await this.requireTask(taskId)
    await this.requireOwner(mangakaId, task.pageId)
    await this.taskStateService.transition(taskId, 'UNDER_REVIEW', undefined, mangakaId)
    await this.taskStateService.transition(taskId, 'APPROVED', undefined, mangakaId)
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
    await this.taskStateService.transition(taskId, 'UNDER_REVIEW', undefined, mangakaId)
    await this.taskStateService.transition(taskId, 'REVISION_REQUESTED', undefined, mangakaId)
    // Prisma enum TaskVersionReviewStatus: PENDING | APPROVED | REVISION_REQUESTED.
    await this.taskRepository.setLatestVersionReview(taskId, {
      reviewStatus: 'REVISION_REQUESTED',
      reviewerNote: body.reviewerNote
    })
    const updated = await this.taskRepository.findTaskById(taskId)
    if (!updated) throw TaskNotFoundException
    if (updated.assistantId) {
      const { round } = await this.revisionService.openSafe({
        targetType: RevisionTargetType.TASK,
        targetId: taskId,
        seriesId: null,
        reason: body.reviewerNote,
        requestedBy: mangakaId,
        recipientId: updated.assistantId
      })
      await this.notify(
        updated.assistantId,
        NotificationType.TASK,
        'TASK_REVISION_REQUESTED',
        taskId,
        TaskMessages.notification.taskRevisionRequested(round, body.reviewerNote)
      )
    }
    return toTaskRes(updated)
  }
}
