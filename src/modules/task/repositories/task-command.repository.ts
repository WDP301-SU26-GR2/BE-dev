import { Specialization, Task, TaskStatus } from '@prisma/client'
import { PrismaService } from 'src/infrastructure/database/prisma.service'
import { TaskHydrationRepository } from './task-hydration.repository'

export class TaskCommandRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hydration: TaskHydrationRepository
  ) {}

  async createTask(data: {
    pageId: string
    regionIds: string[]
    assistantId: string
    taskType: Specialization
    stageId?: string
    description?: string
    deadline: Date | null
    priority: number
    assetIds: string[]
  }): Promise<Task> {
    const row = await this.prisma.task.create({ data: { ...data, status: 'ASSIGNED' } })
    return (await this.hydration.attachEmbeds([row]))[0]
  }

  async createTasksBatch(
    items: Array<{
      pageId: string
      regionIds: string[]
      assistantId: string
      taskType: Specialization
      stageId?: string
      description?: string
      deadline: Date | null
      priority: number
      assetIds: string[]
      groupId?: string | null
      groupTitle?: string | null
    }>
  ): Promise<Task[]> {
    const rows = await this.prisma.$transaction(
      items.map((item) => this.prisma.task.create({ data: { ...item, status: 'ASSIGNED' } }))
    )
    return this.hydration.attachEmbeds(rows)
  }

  updateTaskStatus(id: string, status: TaskStatus, statusReason?: string) {
    return this.prisma.task.update({
      where: { id },
      data: { status, ...(statusReason !== undefined ? { statusReason } : {}) }
    })
  }

  updateTaskFields(
    id: string,
    data: { assetIds?: string[]; description?: string; deadline?: Date | null; priority?: number }
  ) {
    return this.prisma.task.update({ where: { id }, data })
  }

  setStartedAtIfUnset(taskId: string, at: Date) {
    return this.prisma.task.updateMany({
      where: { id: taskId, startedAt: { isSet: false } },
      data: { startedAt: at }
    })
  }

  setCompletedAt(taskId: string, at: Date) {
    return this.prisma.task.update({ where: { id: taskId }, data: { completedAt: at } })
  }

  setAssistant(id: string, assistantId: string) {
    return this.prisma.task.update({ where: { id }, data: { assistantId } })
  }

  pushTaskVersion(id: string, version: { submittedBy: string; versionNumber: number; file: string }) {
    return this.prisma.task.update({
      where: { id },
      data: { versions: { push: { ...version, reviewStatus: 'PENDING' } } }
    })
  }

  async setLatestVersionReview(
    id: string,
    review: { reviewStatus: 'APPROVED' | 'REVISION_REQUESTED'; reviewerNote: string | null }
  ) {
    const task = await this.prisma.task.findUnique({ where: { id }, select: { versions: true } })
    const versions = task?.versions ?? []
    if (versions.length === 0) return this.prisma.task.update({ where: { id }, data: {} })
    versions[versions.length - 1] = {
      ...versions[versions.length - 1],
      reviewStatus: review.reviewStatus,
      reviewerNote: review.reviewerNote
    }
    return this.prisma.task.update({ where: { id }, data: { versions: { set: versions } } })
  }
}
