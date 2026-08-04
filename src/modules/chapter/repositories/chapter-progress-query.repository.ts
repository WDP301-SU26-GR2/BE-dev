import { ChapterStatus, PageStatus, PublicationType, SeriesStatus, Specialization, TaskStatus } from '@prisma/client'
import { PrismaService } from 'src/infrastructure/database/prisma.service'

type ChapterNearDeadline = {
  chapterId: string
  seriesId: string
  chapterNumber: number
  seriesTitle: string
}

type TaskNearDeadline = {
  taskId: string
  assistantId: string | null
  mangakaId: string
  taskType: Specialization | null
  pageNumber: number
  chapterNumber: number
  isOverdue: boolean
}

export type ChapterDeadlineScanItem = {
  chapterId: string
  seriesId: string
  chapterNumber: number
  seriesTitle: string
  publicationType: PublicationType | null
  deadline: Date | null
  mangakaId: string
  editorId: string | null
  progressPct: number
}

export class ChapterProgressQueryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findChaptersForDeadlineScan(): Promise<ChapterDeadlineScanItem[]> {
    const schedules = await this.prisma.schedule.findMany({
      where: { currentDeadline: { not: null } },
      select: {
        chapterId: true,
        currentDeadline: true,
        chapter: {
          select: {
            seriesId: true,
            status: true,
            hold: true,
            chapterNumber: true,
            series: {
              select: { title: true, status: true, publicationType: true, mangakaId: true, editorId: true }
            }
          }
        }
      }
    })
    const alive = schedules.filter(
      (schedule) =>
        schedule.chapter.status !== ChapterStatus.PUBLISHED &&
        !schedule.chapter.hold &&
        schedule.chapter.series.status !== SeriesStatus.HIATUS
    )
    if (alive.length === 0) return []

    const chapterIds = alive.map((schedule) => schedule.chapterId)
    const pages = await this.prisma.page.findMany({
      where: { chapterId: { in: chapterIds } },
      select: { id: true, chapterId: true }
    })
    const tasks = await this.prisma.task.findMany({
      where: { pageId: { in: pages.map((page) => page.id) } },
      select: { pageId: true, status: true }
    })
    const tasksByPage = new Map<string, string[]>()
    for (const task of tasks) {
      const list = tasksByPage.get(task.pageId) ?? []
      list.push(task.status)
      tasksByPage.set(task.pageId, list)
    }
    const pagesByChapter = new Map<string, string[]>()
    for (const page of pages) {
      const list = pagesByChapter.get(page.chapterId) ?? []
      list.push(page.id)
      pagesByChapter.set(page.chapterId, list)
    }

    return alive.map((schedule) => {
      const pageIds = pagesByChapter.get(schedule.chapterId) ?? []
      const ready = pageIds.filter((pageId) => {
        const statuses = (tasksByPage.get(pageId) ?? []).filter((status) => status !== TaskStatus.CANCELLED)
        return statuses.every((status) => status === TaskStatus.APPROVED)
      }).length
      return {
        chapterId: schedule.chapterId,
        seriesId: schedule.chapter.seriesId,
        chapterNumber: schedule.chapter.chapterNumber,
        seriesTitle: schedule.chapter.series.title,
        publicationType: schedule.chapter.series.publicationType,
        deadline: schedule.currentDeadline,
        mangakaId: schedule.chapter.series.mangakaId,
        editorId: schedule.chapter.series.editorId,
        progressPct: pageIds.length === 0 ? 0 : ready / pageIds.length
      }
    })
  }

  async findChaptersNearDeadline(beforeDate: Date): Promise<ChapterNearDeadline[]> {
    const schedules = await this.prisma.schedule.findMany({
      where: { currentDeadline: { lte: beforeDate } },
      select: {
        chapterId: true,
        chapter: {
          select: {
            seriesId: true,
            status: true,
            hold: true,
            chapterNumber: true,
            series: { select: { title: true, status: true } }
          }
        }
      }
    })
    return schedules
      .filter(
        (schedule) =>
          schedule.chapter.status !== ChapterStatus.PUBLISHED &&
          !schedule.chapter.hold &&
          schedule.chapter.series.status !== SeriesStatus.HIATUS
      )
      .map((schedule): ChapterNearDeadline => ({
        chapterId: schedule.chapterId,
        seriesId: schedule.chapter.seriesId,
        chapterNumber: schedule.chapter.chapterNumber,
        seriesTitle: schedule.chapter.series.title
      }))
  }

  async countPagesByStatus(chapterId: string): Promise<Partial<Record<PageStatus, number>>> {
    const rows = await this.prisma.page.groupBy({
      by: ['status'],
      where: { chapterId },
      _count: { _all: true }
    })
    return Object.fromEntries(rows.map((row) => [row.status, row._count._all]))
  }

  async countTasksByStatusForChapter(chapterId: string): Promise<Partial<Record<TaskStatus, number>>> {
    const pages = await this.prisma.page.findMany({ where: { chapterId }, select: { id: true } })
    if (pages.length === 0) return {}
    const rows = await this.prisma.task.groupBy({
      by: ['status'],
      where: { pageId: { in: pages.map((page) => page.id) } },
      _count: { _all: true }
    })
    return Object.fromEntries(rows.map((row) => [row.status, row._count._all]))
  }

  async findActiveChaptersForMangaka(mangakaId: string) {
    return this.findActiveChapters({ mangakaId })
  }

  async findActiveChaptersForEditor(editorId: string) {
    return this.findActiveChapters({ editorId })
  }

  private async findActiveChapters(owner: { mangakaId: string } | { editorId: string }) {
    const series = await this.prisma.series.findMany({
      where: owner,
      select: { id: true, title: true, publicationType: true }
    })
    if (series.length === 0) return { series, chapters: [] }
    const chapters = await this.prisma.chapter.findMany({
      where: { seriesId: { in: series.map((item) => item.id) }, status: { not: ChapterStatus.PUBLISHED } },
      include: { manuscript: true, schedule: true },
      take: 200
    })
    return { series, chapters }
  }

  groupPagesByChapter(chapterIds: string[]) {
    return this.prisma.page.groupBy({
      by: ['chapterId', 'status'],
      where: { chapterId: { in: chapterIds } },
      _count: { _all: true }
    })
  }

  async groupTasksByChapter(chapterIds: string[]) {
    const pages = await this.prisma.page.findMany({
      where: { chapterId: { in: chapterIds } },
      select: { id: true, chapterId: true }
    })
    if (pages.length === 0) return []
    const rows = await this.prisma.task.groupBy({
      by: ['pageId', 'status'],
      where: { pageId: { in: pages.map((page) => page.id) } },
      _count: { _all: true }
    })
    const pageToChapter = new Map(pages.map((page) => [page.id, page.chapterId]))
    return rows.map((row) => ({
      chapterId: pageToChapter.get(row.pageId) as string,
      status: row.status,
      count: row._count._all
    }))
  }

  async groupTasksByPageForChapter(chapterId: string) {
    const rows = await this.groupTasksByPageForChapters([chapterId])
    return rows.map(({ pageId, status, count }) => ({ pageId, status, count }))
  }

  async groupTasksByPageForChapters(chapterIds: string[]) {
    if (chapterIds.length === 0) return []
    const pages = await this.prisma.page.findMany({
      where: { chapterId: { in: chapterIds } },
      select: { id: true, chapterId: true }
    })
    if (pages.length === 0) return []
    const rows = await this.prisma.task.groupBy({
      by: ['pageId', 'status'],
      where: { pageId: { in: pages.map((page) => page.id) } },
      _count: { _all: true }
    })
    const pageToChapter = new Map(pages.map((page) => [page.id, page.chapterId]))
    return rows.map((row) => ({
      chapterId: pageToChapter.get(row.pageId) as string,
      pageId: row.pageId,
      status: row.status,
      count: row._count._all
    }))
  }

  async findTasksNearDeadline(now: Date, before: Date, minLeadMs: number): Promise<TaskNearDeadline[]> {
    const tasks = await this.prisma.task.findMany({
      where: {
        deadline: { lte: before },
        status: { in: [TaskStatus.ASSIGNED, TaskStatus.IN_PROGRESS, TaskStatus.REVISION_REQUESTED] }
      },
      select: { id: true, assistantId: true, pageId: true, taskType: true, deadline: true, createdAt: true }
    })
    if (tasks.length === 0) return []
    const pages = await this.prisma.page.findMany({
      where: { id: { in: tasks.map((task) => task.pageId) } },
      select: {
        id: true,
        pageNumber: true,
        chapter: {
          select: {
            hold: true,
            chapterNumber: true,
            series: { select: { mangakaId: true, status: true } }
          }
        }
      }
    })
    const byPage = new Map(pages.map((page) => [page.id, page]))
    return tasks.flatMap((task) => {
      const page = byPage.get(task.pageId)
      // Task ngắn (lead-time deadline−createdAt ≤ ngưỡng) → bỏ cảnh báo, tránh làm phiền ngay lúc mới giao.
      return !page ||
        page.chapter.hold ||
        page.chapter.series.status === SeriesStatus.HIATUS ||
        (task.deadline != null && task.deadline.getTime() - task.createdAt.getTime() <= minLeadMs)
        ? []
        : [
            {
              taskId: task.id,
              assistantId: task.assistantId,
              mangakaId: page.chapter.series.mangakaId,
              taskType: task.taskType,
              pageNumber: page.pageNumber,
              chapterNumber: page.chapter.chapterNumber,
              isOverdue: task.deadline != null && task.deadline.getTime() < now.getTime()
            }
          ]
    })
  }
}
