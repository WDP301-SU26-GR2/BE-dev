import { Injectable } from '@nestjs/common'
import { $Enums, ManuscriptStatus, NameStatus, TaskStatus } from '@prisma/client'
import { RoleName } from 'src/core/security/constants/role.constant'
import { ChapterRepository } from '../chapter.repo'
import {
  BLOCKING_TASK_STATUSES,
  computeWarningLevel,
  PROGRESS_DONE_STATUSES,
  WARNING_LEVEL,
  WarningLevel
} from '../chapter.constant'
import { ChapterAccessDeniedException, ChapterNotFoundException } from '../errors/chapter.errors'

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/

const SEVERITY: Record<WarningLevel, number> = {
  [WARNING_LEVEL.CRITICAL]: 0,
  [WARNING_LEVEL.RED]: 1,
  [WARNING_LEVEL.YELLOW]: 2,
  [WARNING_LEVEL.NONE]: 3
}

const OPEN_TASK_STATUSES: TaskStatus[] = [
  TaskStatus.ASSIGNED,
  TaskStatus.IN_PROGRESS,
  TaskStatus.SUBMITTED,
  TaskStatus.UNDER_REVIEW,
  TaskStatus.REVISION_REQUESTED,
  TaskStatus.ON_HOLD
]

const roundHours = (deadline: Date | null, now: Date) =>
  deadline ? Math.round(((deadline.getTime() - now.getTime()) / 3_600_000) * 10) / 10 : null

type PageTaskRow = { pageId: string; status: TaskStatus; count: number }

const countBlockedPages = (taskRows: PageTaskRow[]) =>
  new Set(
    taskRows.filter((row) => BLOCKING_TASK_STATUSES.includes(row.status) && row.count > 0).map((row) => row.pageId)
  ).size

/** A page is ready when it has no blocking task; pages without tasks are therefore ready. */
export function computeReadyPages(pageIds: string[], taskRows: PageTaskRow[]): number {
  const pageIdSet = new Set(pageIds)
  const blockedPages = new Set(
    taskRows
      .filter((row) => pageIdSet.has(row.pageId) && BLOCKING_TASK_STATUSES.includes(row.status) && row.count > 0)
      .map((row) => row.pageId)
  )
  return pageIds.filter((id) => !blockedPages.has(id)).length
}

export function computeProgressPct(
  manuscriptStatus: ManuscriptStatus | null,
  totalPages: number,
  readyPages: number
): number {
  if (manuscriptStatus && PROGRESS_DONE_STATUSES.includes(manuscriptStatus)) return 1
  if (totalPages === 0) return 0
  return readyPages / totalPages
}

@Injectable()
export class ChapterProgressService {
  constructor(private readonly chapterRepository: ChapterRepository) {}

  async getProgress(user: { userId: string; roleName: string }, chapterId: string) {
    if (!OBJECT_ID_RE.test(chapterId)) throw ChapterNotFoundException
    const chapter = await this.chapterRepository.findChapterById(chapterId)
    if (!chapter) throw ChapterNotFoundException
    const series = await this.chapterRepository.findSeriesById(chapter.seriesId)
    if (!series) throw ChapterNotFoundException

    const allowed =
      (user.roleName === RoleName.MANGAKA && series.mangakaId === user.userId) ||
      (user.roleName === RoleName.EDITOR && series.editorId === user.userId) ||
      user.roleName === RoleName.BOARD_MEMBER ||
      user.roleName === RoleName.SUPER_ADMIN
    if (!allowed) throw ChapterAccessDeniedException

    const [pages, pageTaskRows, manuscript, taskCounts, nameStatus, schedule] = await Promise.all([
      this.chapterRepository.findPagesByChapterId(chapterId),
      this.chapterRepository.groupTasksByPageForChapter(chapterId),
      this.chapterRepository.findManuscriptByChapterId(chapterId),
      this.chapterRepository.countTasksByStatusForChapter(chapterId),
      chapter.nameId
        ? this.chapterRepository.findNameStatus(chapter.nameId)
        : Promise.resolve(null as NameStatus | null),
      this.chapterRepository.findScheduleByChapterId(chapterId)
    ])
    const totalPages = pages.length
    const pagesReady = computeReadyPages(
      pages.map((page) => page.id),
      pageTaskRows
    )
    const progressPct = computeProgressPct(manuscript?.status ?? null, totalPages, pagesReady)
    const deadline = schedule?.currentDeadline ?? null
    const now = new Date()
    return {
      chapterId,
      nameStatus,
      totalPages,
      pagesReady,
      pagesPending: totalPages - pagesReady,
      taskBreakdown: {
        assigned: taskCounts.ASSIGNED ?? 0,
        inProgress: taskCounts.IN_PROGRESS ?? 0,
        submitted: taskCounts.SUBMITTED ?? 0,
        underReview: taskCounts.UNDER_REVIEW ?? 0,
        approved: taskCounts.APPROVED ?? 0,
        revisionRequested: taskCounts.REVISION_REQUESTED ?? 0,
        onHold: taskCounts.ON_HOLD ?? 0,
        cancelled: taskCounts.CANCELLED ?? 0
      },
      deadline: deadline ? deadline.toISOString() : null,
      remainingHours: roundHours(deadline, now),
      progressPct,
      warningLevel: computeWarningLevel(series.publicationType ?? null, deadline, progressPct, now),
      onHold: chapter.hold != null
    }
  }

  async overviewForMangaka(mangakaId: string) {
    const { series, chapters } = await this.chapterRepository.findActiveChaptersForMangaka(mangakaId)
    return this.buildOverview(series, chapters)
  }

  async overviewForEditor(editorId: string) {
    const { series, chapters } = await this.chapterRepository.findActiveChaptersForEditor(editorId)
    return this.buildOverview(series, chapters)
  }

  private async buildOverview(
    series: Array<{ id: string; title: string; publicationType: $Enums.PublicationType | null }>,
    chapters: Awaited<ReturnType<ChapterRepository['findActiveChaptersForMangaka']>>['chapters']
  ) {
    const seriesById = new Map(series.map((item) => [item.id, item]))
    const chapterIds = chapters.map((chapter) => chapter.id)
    const [pageRows, taskRows, pageTaskRows] = await Promise.all([
      chapterIds.length ? this.chapterRepository.groupPagesByChapter(chapterIds) : Promise.resolve([]),
      chapterIds.length ? this.chapterRepository.groupTasksByChapter(chapterIds) : Promise.resolve([]),
      chapterIds.length ? this.chapterRepository.groupTasksByPageForChapters(chapterIds) : Promise.resolve([])
    ])
    const now = new Date()
    const items = chapters.map((chapter) => {
      const seriesItem = seriesById.get(chapter.seriesId)
      const pages = pageRows.filter((row) => row.chapterId === chapter.id)
      const totalPages = pages.reduce((sum, row) => sum + row._count._all, 0)
      const chapterPageTaskRows = pageTaskRows.filter((row) => row.chapterId === chapter.id)
      const pagesReady = totalPages - countBlockedPages(chapterPageTaskRows)
      const openTasks = taskRows
        .filter((row) => row.chapterId === chapter.id && OPEN_TASK_STATUSES.includes(row.status))
        .reduce((sum, row) => sum + row.count, 0)
      const deadline = chapter.schedule?.currentDeadline ?? null
      const progressPct = computeProgressPct(chapter.manuscript?.status ?? null, totalPages, pagesReady)
      const warningLevel = computeWarningLevel(seriesItem?.publicationType ?? null, deadline, progressPct, now)
      return {
        chapterId: chapter.id,
        seriesId: chapter.seriesId,
        seriesTitle: seriesItem?.title ?? '',
        chapterNumber: chapter.chapterNumber,
        title: chapter.title,
        manuscriptStatus: chapter.manuscript?.status ?? null,
        deadline: deadline ? deadline.toISOString() : null,
        remainingHours: roundHours(deadline, now),
        progressPct,
        warningLevel,
        onHold: chapter.hold != null,
        pagesReady,
        pagesPending: totalPages - pagesReady,
        totalPages,
        openTasks
      }
    })
    items.sort(
      (a, b) =>
        SEVERITY[a.warningLevel] - SEVERITY[b.warningLevel] ||
        (a.deadline ?? '9999-12-31T23:59:59.999Z').localeCompare(b.deadline ?? '9999-12-31T23:59:59.999Z')
    )
    return { items }
  }
}
