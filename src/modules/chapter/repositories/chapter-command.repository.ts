import { ChapterHoldAction, ChapterStatus, CoOwnerApprovalStatus, ManuscriptStatus, PageStatus } from '@prisma/client'
import { PrismaService } from 'src/infrastructure/database/prisma.service'
import { computePageRenumber, deriveChapterStatus } from '../chapter.constant'
import { ChapterQueryRepository } from './chapter-query.repository'

export class ChapterCommandRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queries: ChapterQueryRepository
  ) {}

  async createChapter(data: {
    seriesId: string
    chapterNumber: number
    title?: string | null
    storyboardId?: string | null
  }) {
    const chapter = await this.prisma.chapter.create({
      data: {
        seriesId: data.seriesId,
        storyboardId: data.storyboardId ?? null,
        chapterNumber: data.chapterNumber,
        title: data.title ?? null,
        status: ChapterStatus.DRAFT
      }
    })
    await this.prisma.manuscript.create({ data: { chapterId: chapter.id, status: ManuscriptStatus.DRAFT } })
    await this.prisma.schedule.create({ data: { chapterId: chapter.id } })
    return this.queries.findChapterWithRelations(chapter.id)
  }

  updateChapter(id: string, data: { title?: string; chapterNumber?: number }) {
    return this.prisma.chapter.update({ where: { id }, data })
  }
  setChapterHold(chapterId: string, hold: { reason: string; expectedReturnDate: Date | null; heldBy: string }) {
    return this.prisma.chapter.update({
      where: { id: chapterId },
      data: {
        hold: { set: { ...hold, heldAt: new Date() } },
        holdHistory: {
          push: {
            action: ChapterHoldAction.HOLD,
            by: hold.heldBy,
            reason: hold.reason,
            expectedReturnDate: hold.expectedReturnDate
          }
        }
      },
      include: { manuscript: true, schedule: true }
    })
  }
  unsetChapterHold(chapterId: string, by: string) {
    return this.prisma.chapter.update({
      where: { id: chapterId },
      data: { hold: { unset: true }, holdHistory: { push: { action: ChapterHoldAction.RESUME, by } } },
      include: { manuscript: true, schedule: true }
    })
  }
  async deleteChapterCascade(chapterId: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.storyboard.deleteMany({ where: { chapterId } })
      await tx.manuscript.deleteMany({ where: { chapterId } })
      await tx.schedule.deleteMany({ where: { chapterId } })
      await tx.page.deleteMany({ where: { chapterId } })
      await tx.chapterCoOwnerApproval.deleteMany({ where: { chapterId } })
      await tx.deadlineRequest.deleteMany({ where: { chapterId } })
      await tx.chapter.delete({ where: { id: chapterId } })
    })
  }
  async applyManuscriptTransition(
    chapterId: string,
    manuscriptId: string,
    entry: { from: ManuscriptStatus; to: ManuscriptStatus; changedBy: string; reason?: string }
  ) {
    const now = new Date()
    await this.prisma.manuscript.update({
      where: { id: manuscriptId },
      data: {
        status: entry.to,
        approvedAt: entry.to === ManuscriptStatus.PUBLISHED ? now : undefined,
        statusHistory: {
          push: {
            from: entry.from,
            to: entry.to,
            changedBy: entry.changedBy,
            reason: entry.reason ?? null,
            changedAt: now
          }
        }
      }
    })
    await this.prisma.chapter.update({
      where: { id: chapterId },
      data: {
        status: deriveChapterStatus(entry.to),
        publishedAt: entry.to === ManuscriptStatus.PUBLISHED ? now : undefined
      }
    })
    return this.queries.findChapterWithRelations(chapterId)
  }
  updateSchedule(chapterId: string, data: { originalDeadline?: Date; currentDeadline?: Date }) {
    return this.prisma.schedule.update({ where: { chapterId }, data })
  }
  extendSchedule(
    chapterId: string,
    ext: { extendedBy: string; previousDeadline: Date | null; newDeadline: Date; reason?: string }
  ) {
    return this.prisma.schedule.update({
      where: { chapterId },
      data: {
        currentDeadline: ext.newDeadline,
        extended: true,
        extensions: {
          push: {
            extendedBy: ext.extendedBy,
            previousDeadline: ext.previousDeadline,
            newDeadline: ext.newDeadline,
            reason: ext.reason ?? null,
            extendedAt: new Date()
          }
        }
      }
    })
  }
  createPage(chapterId: string, data: { pageNumber: number; originalFile: string }) {
    return this.prisma.page.create({
      data: { chapterId, pageNumber: data.pageNumber, originalFile: data.originalFile, status: PageStatus.DRAFT }
    })
  }
  async deletePagesCascade(chapterId: string, pageIds: string[]) {
    return this.prisma.$transaction(async (tx) => {
      const removedTasks = await tx.task.findMany({
        where: { pageId: { in: pageIds } },
        select: { id: true, assistantId: true, status: true, taskType: true, versions: true }
      })
      const taskIds = removedTasks.map((task) => task.id)
      const annotations = await tx.annotation.deleteMany({ where: { taskId: { in: taskIds } } })
      await tx.productionStagePage.deleteMany({ where: { pageId: { in: pageIds } } })
      await tx.aiJob.deleteMany({ where: { pageId: { in: pageIds } } })
      const tasks = await tx.task.deleteMany({ where: { pageId: { in: pageIds } } })
      const regions = await tx.region.deleteMany({ where: { pageId: { in: pageIds } } })
      await tx.page.deleteMany({ where: { id: { in: pageIds } } })
      const remaining = await tx.page.findMany({
        where: { chapterId },
        orderBy: { pageNumber: 'asc' },
        select: { id: true, pageNumber: true }
      })
      for (const update of computePageRenumber(remaining)) {
        await tx.page.update({ where: { id: update.id }, data: { pageNumber: update.pageNumber } })
      }
      return {
        deletedTasks: tasks.count,
        deletedRegions: regions.count,
        deletedAnnotations: annotations.count,
        removedTasks: removedTasks.map((task) => ({
          id: task.id,
          assistantId: task.assistantId,
          status: task.status,
          taskType: task.taskType,
          versionCount: task.versions.length
        }))
      }
    })
  }
  deletePageCascade(chapterId: string, pageId: string) {
    return this.deletePagesCascade(chapterId, [pageId])
  }
  updatePage(id: string, data: { originalFile?: string; compositeFile?: string; pageNumber?: number }) {
    return this.prisma.page.update({ where: { id }, data })
  }
  updatePageStatus(id: string, status: PageStatus) {
    return this.prisma.page.update({ where: { id }, data: { status } })
  }
  createCoOwnerApproval(data: { chapterId: string; coOwnerId: string; deadline: Date }) {
    return this.prisma.chapterCoOwnerApproval.create({
      data: { ...data, status: CoOwnerApprovalStatus.PENDING }
    })
  }
  updateCoOwnerApproval(
    id: string,
    data: { status: CoOwnerApprovalStatus; decisionAt?: Date; rejectReason?: string; escalatedAt?: Date }
  ) {
    return this.prisma.chapterCoOwnerApproval.update({ where: { id }, data })
  }
}
