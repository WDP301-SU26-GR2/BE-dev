import { Injectable } from '@nestjs/common'
import { $Enums, NameStatus, PageStatus, TaskStatus } from '@prisma/client'
import { RoleName } from 'src/core/security/constants/role.constant'
import { ChapterRepository } from '../chapter.repo'
import { computeWarningLevel, WARNING_LEVEL, WarningLevel } from '../chapter.constant'
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

    const [pageCounts, taskCounts, nameStatus, schedule] = await Promise.all([
      this.chapterRepository.countPagesByStatus(chapterId),
      this.chapterRepository.countTasksByStatusForChapter(chapterId),
      chapter.nameId
        ? this.chapterRepository.findNameStatus(chapter.nameId)
        : Promise.resolve(null as NameStatus | null),
      this.chapterRepository.findScheduleByChapterId(chapterId)
    ])
    const totalPages = Object.values(pageCounts).reduce((sum, count) => sum + (count ?? 0), 0)
    const pagesCompleted = pageCounts.COMPLETED ?? 0
    const progressPct = totalPages === 0 ? 0 : pagesCompleted / totalPages
    const deadline = schedule?.currentDeadline ?? null
    const now = new Date()
    return {
      chapterId,
      nameStatus,
      totalPages,
      pagesCompleted,
      pagesInProgress: (pageCounts.IN_PROGRESS ?? 0) + (pageCounts.COMPOSITE_READY ?? 0),
      pagesNotStarted: pageCounts.NOT_STARTED ?? 0,
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
    const [pageRows, taskRows] = await Promise.all([
      chapterIds.length ? this.chapterRepository.groupPagesByChapter(chapterIds) : Promise.resolve([]),
      chapterIds.length ? this.chapterRepository.groupTasksByChapter(chapterIds) : Promise.resolve([])
    ])
    const now = new Date()
    const items = chapters.map((chapter) => {
      const seriesItem = seriesById.get(chapter.seriesId)
      const pages = pageRows.filter((row) => row.chapterId === chapter.id)
      const totalPages = pages.reduce((sum, row) => sum + row._count._all, 0)
      const pagesCompleted = pages.find((row) => row.status === PageStatus.COMPLETED)?._count._all ?? 0
      const openTasks = taskRows
        .filter((row) => row.chapterId === chapter.id && OPEN_TASK_STATUSES.includes(row.status))
        .reduce((sum, row) => sum + row.count, 0)
      const deadline = chapter.schedule?.currentDeadline ?? null
      const progressPct = totalPages === 0 ? 0 : pagesCompleted / totalPages
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
        pagesCompleted,
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
