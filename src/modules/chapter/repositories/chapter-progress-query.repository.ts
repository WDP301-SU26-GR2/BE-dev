import { ChapterStatus, PageStatus, Specialization, TaskStatus } from '@prisma/client'
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
}

export class ChapterProgressQueryRepository {
  constructor(private readonly prisma: PrismaService) {}

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
            series: { select: { title: true } }
          }
        }
      }
    })
    return schedules
      .filter((schedule) => schedule.chapter.status !== ChapterStatus.PUBLISHED && !schedule.chapter.hold)
      .map(
        (schedule): ChapterNearDeadline => ({
          chapterId: schedule.chapterId,
          seriesId: schedule.chapter.seriesId,
          chapterNumber: schedule.chapter.chapterNumber,
          seriesTitle: schedule.chapter.series.title
        })
      )
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

  async findTasksNearDeadline(now: Date, before: Date): Promise<TaskNearDeadline[]> {
    const tasks = await this.prisma.task.findMany({
      where: {
        deadline: { gt: now, lte: before },
        status: { in: [TaskStatus.ASSIGNED, TaskStatus.IN_PROGRESS, TaskStatus.REVISION_REQUESTED] }
      },
      select: { id: true, assistantId: true, pageId: true, taskType: true }
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
            series: { select: { mangakaId: true } }
          }
        }
      }
    })
    const byPage = new Map(pages.map((page) => [page.id, page]))
    return tasks.flatMap((task) => {
      const page = byPage.get(task.pageId)
      return !page || page.chapter.hold
        ? []
        : [
            {
              taskId: task.id,
              assistantId: task.assistantId,
              mangakaId: page.chapter.series.mangakaId,
              taskType: task.taskType,
              pageNumber: page.pageNumber,
              chapterNumber: page.chapter.chapterNumber
            }
          ]
    })
  }
}
