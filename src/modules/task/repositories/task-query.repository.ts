import { Task, TaskStatus } from '@prisma/client'
import { SeriesStatus } from '@prisma/client'
import { PrismaService } from 'src/infrastructure/database/prisma.service'
import type { TaskListWhere } from '../task.repo'
import { TaskHydrationRepository } from './task-hydration.repository'

export type OverdueTaskItem = {
  taskId: string
  assistantId: string | null
  mangakaId: string
  pageNumber: number
  chapterNumber: number
}

export class TaskQueryRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hydration: TaskHydrationRepository
  ) {}

  async findTaskDownloadContext(taskId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, pageId: true, stageId: true, assistantId: true, assetIds: true, versions: true }
    })
    if (!task) return null
    const [page, assets, stagePage] = await Promise.all([
      this.prisma.page.findUnique({
        where: { id: task.pageId },
        select: {
          originalFile: true,
          compositeFile: true,
          chapter: { select: { series: { select: { mangakaId: true, editorId: true } } } }
        }
      }),
      task.assetIds.length > 0
        ? this.prisma.asset.findMany({ where: { id: { in: task.assetIds } }, select: { filePath: true } })
        : Promise.resolve([] as { filePath: string }[]),
      task.stageId
        ? this.prisma.productionStagePage.findUnique({
            where: { stageId_pageId: { stageId: task.stageId, pageId: task.pageId } },
            select: { inputFileKey: true }
          })
        : Promise.resolve(null)
    ])
    return {
      task,
      page,
      assetKeys: assets.map((asset) => asset.filePath),
      stageInputKey: stagePage?.inputFileKey ?? null
    }
  }

  findPageWithOwner(pageId: string) {
    return this.prisma.page.findUnique({
      where: { id: pageId },
      select: {
        id: true,
        chapterId: true,
        status: true,
        originalFile: true,
        chapter: { select: { seriesId: true, hold: true, series: { select: { mangakaId: true } } } }
      }
    })
  }

  async findOwnedPageIds(mangakaId: string | undefined, filter: { seriesId?: string; chapterId?: string }) {
    let chapterIds: string[]
    if (filter.chapterId) {
      const chapter = await this.prisma.chapter.findUnique({
        where: { id: filter.chapterId },
        select: { id: true, series: { select: { mangakaId: true } } }
      })
      if (!chapter || (mangakaId && chapter.series.mangakaId !== mangakaId)) return []
      chapterIds = [chapter.id]
    } else {
      const series = await this.prisma.series.findMany({
        where: { ...(mangakaId ? { mangakaId } : {}), ...(filter.seriesId ? { id: filter.seriesId } : {}) },
        select: { id: true }
      })
      if (series.length === 0) return []
      const chapters = await this.prisma.chapter.findMany({
        where: { seriesId: { in: series.map((row) => row.id) } },
        select: { id: true }
      })
      if (chapters.length === 0) return []
      chapterIds = chapters.map((chapter) => chapter.id)
    }
    const pages = await this.prisma.page.findMany({ where: { chapterId: { in: chapterIds } }, select: { id: true } })
    return pages.map((page) => page.id)
  }

  findTasksByGroup(groupId: string) {
    return this.prisma.task.findMany({ where: { groupId }, select: { id: true, status: true, pageId: true } })
  }

  async findTaskById(id: string) {
    const row = await this.prisma.task.findUnique({ where: { id } })
    if (!row) return null
    return (await this.hydration.attachEmbeds([row]))[0]
  }

  async listTasks(where: TaskListWhere, page: { limit: number; offset: number }) {
    const rows = await this.prisma.task.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: page.offset,
      take: page.limit
    })
    return this.hydration.attachListEmbeds(rows)
  }

  countTasks(where: TaskListWhere) {
    return this.prisma.task.count({ where })
  }

  findTasksByAssistantInStatuses(assistantId: string, statuses: TaskStatus[]): Promise<Task[]> {
    return this.prisma.task.findMany({ where: { assistantId, status: { in: statuses } } })
  }

  async findOverdueForCancel(cutoff: Date): Promise<OverdueTaskItem[]> {
    const tasks = await this.prisma.task.findMany({
      where: {
        deadline: { not: null, lt: cutoff },
        status: { in: [TaskStatus.ASSIGNED, TaskStatus.IN_PROGRESS, TaskStatus.REVISION_REQUESTED] }
      },
      select: { id: true, assistantId: true, pageId: true, deadline: true }
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
      // Chapter đang tạm dừng hoặc bộ truyện đang tạm ngưng → sản xuất đóng băng có chủ đích, không tính trễ.
      if (!page || page.chapter.hold || page.chapter.series.status === SeriesStatus.HIATUS) return []
      return [
        {
          taskId: task.id,
          assistantId: task.assistantId,
          mangakaId: page.chapter.series.mangakaId,
          pageNumber: page.pageNumber,
          chapterNumber: page.chapter.chapterNumber
        }
      ]
    })
  }
}
