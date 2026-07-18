import { Injectable } from '@nestjs/common'
import {
  ChapterHoldAction,
  ChapterStatus,
  CoOwnerApprovalStatus,
  ManuscriptStatus,
  NameStatus,
  PageStatus,
  TaskStatus
} from '@prisma/client'
import { PrismaService } from 'src/infrastructure/database/prisma.service'
import { deriveChapterStatus } from './chapter.constant'

@Injectable()
export class ChapterRepository {
  constructor(private readonly prismaService: PrismaService) {}

  /** Transaction-scoped repository used by state services for multi-collection transitions. */
  withTransaction<T>(work: (repository: ChapterRepository) => Promise<T>): Promise<T> {
    return this.prismaService.$transaction((tx) => work(new ChapterRepository(tx as unknown as PrismaService)))
  }

  // ----- read-only cross-entity (precondition) -----
  findSeriesById(seriesId: string) {
    return this.prismaService.series.findUnique({ where: { id: seriesId } })
  }
  findNameById(nameId: string) {
    return this.prismaService.name.findUnique({ where: { id: nameId } })
  }
  // Fix-1 G-1: đếm chapter hiện có để enforce endingChapterAllowance khi series CANCELLING.
  countChaptersBySeriesId(seriesId: string): Promise<number> {
    return this.prismaService.chapter.count({ where: { seriesId } })
  }

  // A3 publish gate (BR-CONTRACT-05): series phải có Contract FULLY_EXECUTED trước khi publish.
  // Cross-module read prisma.contract (tiền lệ: reprint/payment repo). Chỉ select id (nhẹ).
  findExecutedContractBySeriesId(seriesId: string) {
    return this.prismaService.contract.findFirst({
      where: { seriesId, status: 'FULLY_EXECUTED' },
      select: { id: true }
    })
  }

  // ----- chapter -----
  async createChapter(data: {
    seriesId: string
    chapterNumber: number
    title?: string | null
    nameId?: string | null
  }) {
    const chapter = await this.prismaService.chapter.create({
      data: {
        seriesId: data.seriesId,
        nameId: data.nameId ?? null,
        chapterNumber: data.chapterNumber,
        title: data.title ?? null,
        status: ChapterStatus.DRAFT
      }
    })
    await this.prismaService.manuscript.create({ data: { chapterId: chapter.id, status: ManuscriptStatus.DRAFT } })
    await this.prismaService.schedule.create({ data: { chapterId: chapter.id } })
    return this.findChapterWithRelations(chapter.id)
  }

  findChapterById(id: string) {
    return this.prismaService.chapter.findUnique({ where: { id } })
  }
  findChapterWithRelations(id: string) {
    return this.prismaService.chapter.findUnique({
      where: { id },
      include: { manuscript: true, schedule: true }
    })
  }
  findChapterWithSeries(id: string) {
    return this.prismaService.chapter.findFirst({
      where: { id },
      select: {
        id: true,
        seriesId: true,
        chapterNumber: true,
        status: true,
        nameId: true,
        series: { select: { mangakaId: true } }
      }
    })
  }
  updateChapter(id: string, data: { title?: string; chapterNumber?: number }) {
    return this.prismaService.chapter.update({ where: { id }, data })
  }
  updateNameChapterNumber(nameId: string, chapterNumber: number) {
    return this.prismaService.name.update({ where: { id: nameId }, data: { chapterNumber } })
  }
  findChaptersBySeriesId(seriesId: string) {
    return this.prismaService.chapter.findMany({
      where: { seriesId },
      include: { manuscript: true, schedule: true },
      orderBy: { chapterNumber: 'asc' }
    })
  }
  findChapterByNumber(seriesId: string, chapterNumber: number) {
    return this.prismaService.chapter.findFirst({ where: { seriesId, chapterNumber } })
  }
  findManuscriptByChapterId(chapterId: string) {
    return this.prismaService.manuscript.findUnique({ where: { chapterId } })
  }

  async setChapterHold(chapterId: string, hold: { reason: string; expectedReturnDate: Date | null; heldBy: string }) {
    return await this.prismaService.chapter.update({
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

  async unsetChapterHold(chapterId: string, by: string) {
    return await this.prismaService.chapter.update({
      where: { id: chapterId },
      data: { hold: { unset: true }, holdHistory: { push: { action: ChapterHoldAction.RESUME, by } } },
      include: { manuscript: true, schedule: true }
    })
  }

  async findSeriesRecipients(seriesId: string): Promise<{ mangakaId: string; editorId: string | null } | null> {
    const series = await this.prismaService.series.findUnique({
      where: { id: seriesId },
      select: { mangakaId: true, editorId: true }
    })
    return series ? { mangakaId: series.mangakaId, editorId: series.editorId ?? null } : null
  }

  async findChaptersNearDeadline(beforeDate: Date): Promise<Array<{ chapterId: string; seriesId: string }>> {
    const schedules = await this.prismaService.schedule.findMany({
      where: { currentDeadline: { lte: beforeDate } },
      select: { chapterId: true, chapter: { select: { seriesId: true, status: true, hold: true } } }
    })
    return schedules
      .filter((schedule) => schedule.chapter.status !== ChapterStatus.PUBLISHED && !schedule.chapter.hold)
      .map((schedule) => ({ chapterId: schedule.chapterId, seriesId: schedule.chapter.seriesId }))
  }

  async countPagesByStatus(chapterId: string): Promise<Partial<Record<PageStatus, number>>> {
    const rows = await this.prismaService.page.groupBy({
      by: ['status'],
      where: { chapterId },
      _count: { _all: true }
    })
    return Object.fromEntries(rows.map((row) => [row.status, row._count._all]))
  }

  async countTasksByStatusForChapter(chapterId: string): Promise<Partial<Record<TaskStatus, number>>> {
    const pages = await this.prismaService.page.findMany({ where: { chapterId }, select: { id: true } })
    if (pages.length === 0) return {}
    const rows = await this.prismaService.task.groupBy({
      by: ['status'],
      where: { pageId: { in: pages.map((page) => page.id) } },
      _count: { _all: true }
    })
    return Object.fromEntries(rows.map((row) => [row.status, row._count._all]))
  }

  async findNameStatus(nameId: string): Promise<NameStatus | null> {
    const name = await this.prismaService.name.findUnique({ where: { id: nameId }, select: { status: true } })
    return name?.status ?? null
  }

  async findActiveChaptersForMangaka(mangakaId: string) {
    const series = await this.prismaService.series.findMany({
      where: { mangakaId },
      select: { id: true, title: true, publicationType: true }
    })
    if (series.length === 0) return { series, chapters: [] }
    const chapters = await this.prismaService.chapter.findMany({
      where: { seriesId: { in: series.map((item) => item.id) }, status: { not: ChapterStatus.PUBLISHED } },
      include: { manuscript: true, schedule: true },
      take: 200
    })
    return { series, chapters }
  }

  async findActiveChaptersForEditor(editorId: string) {
    const series = await this.prismaService.series.findMany({
      where: { editorId },
      select: { id: true, title: true, publicationType: true }
    })
    if (series.length === 0) return { series, chapters: [] }
    const chapters = await this.prismaService.chapter.findMany({
      where: { seriesId: { in: series.map((item) => item.id) }, status: { not: ChapterStatus.PUBLISHED } },
      include: { manuscript: true, schedule: true },
      take: 200
    })
    return { series, chapters }
  }

  async groupPagesByChapter(chapterIds: string[]) {
    return await this.prismaService.page.groupBy({
      by: ['chapterId', 'status'],
      where: { chapterId: { in: chapterIds } },
      _count: { _all: true }
    })
  }

  async groupTasksByChapter(chapterIds: string[]) {
    const pages = await this.prismaService.page.findMany({
      where: { chapterId: { in: chapterIds } },
      select: { id: true, chapterId: true }
    })
    if (pages.length === 0) return []
    const rows = await this.prismaService.task.groupBy({
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

  async groupTasksByPageForChapter(
    chapterId: string
  ): Promise<{ pageId: string; status: TaskStatus; count: number }[]> {
    const rows = await this.groupTasksByPageForChapters([chapterId])
    return rows.map(({ pageId, status, count }) => ({ pageId, status, count }))
  }

  async groupTasksByPageForChapters(
    chapterIds: string[]
  ): Promise<{ chapterId: string; pageId: string; status: TaskStatus; count: number }[]> {
    if (chapterIds.length === 0) return []
    const pages = await this.prismaService.page.findMany({
      where: { chapterId: { in: chapterIds } },
      select: { id: true, chapterId: true }
    })
    if (pages.length === 0) return []
    const rows = await this.prismaService.task.groupBy({
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

  async findTasksNearDeadline(now: Date, before: Date) {
    const tasks = await this.prismaService.task.findMany({
      where: {
        deadline: { gt: now, lte: before },
        status: { in: [TaskStatus.ASSIGNED, TaskStatus.IN_PROGRESS, TaskStatus.REVISION_REQUESTED] }
      },
      select: { id: true, assistantId: true, pageId: true }
    })
    if (tasks.length === 0) return []
    const pages = await this.prismaService.page.findMany({
      where: { id: { in: tasks.map((task) => task.pageId) } },
      select: { id: true, chapter: { select: { hold: true, series: { select: { mangakaId: true } } } } }
    })
    const byPage = new Map(pages.map((page) => [page.id, page]))
    return tasks.flatMap((task) => {
      const page = byPage.get(task.pageId)
      if (!page || page.chapter.hold) return []
      return [{ taskId: task.id, assistantId: task.assistantId, mangakaId: page.chapter.series.mangakaId }]
    })
  }

  // Task 5 (Spec 10): cascade delete chapter + related Name/Manuscript/Schedule/Pages.
  async deleteChapterCascade(chapterId: string) {
    await this.prismaService.$transaction(async (tx) => {
      await tx.name.deleteMany({ where: { chapterId } })
      await tx.manuscript.deleteMany({ where: { chapterId } })
      await tx.schedule.deleteMany({ where: { chapterId } })
      await tx.page.deleteMany({ where: { chapterId } })
      await tx.chapterCoOwnerApproval.deleteMany({ where: { chapterId } })
      await tx.deadlineRequest.deleteMany({ where: { chapterId } })
      await tx.chapter.delete({ where: { id: chapterId } })
    })
  }

  // ----- single-writer: Manuscript.status + Chapter.status -----
  async applyManuscriptTransition(
    chapterId: string,
    manuscriptId: string,
    entry: { from: ManuscriptStatus; to: ManuscriptStatus; changedBy: string; reason?: string }
  ) {
    const now = new Date()
    await this.prismaService.manuscript.update({
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
    await this.prismaService.chapter.update({
      where: { id: chapterId },
      data: {
        status: deriveChapterStatus(entry.to),
        publishedAt: entry.to === ManuscriptStatus.PUBLISHED ? now : undefined
      }
    })
    return this.findChapterWithRelations(chapterId)
  }

  // ----- schedule -----
  findScheduleByChapterId(chapterId: string) {
    return this.prismaService.schedule.findUnique({ where: { chapterId } })
  }
  updateSchedule(chapterId: string, data: { originalDeadline?: Date; currentDeadline?: Date }) {
    return this.prismaService.schedule.update({ where: { chapterId }, data })
  }
  extendSchedule(
    chapterId: string,
    ext: { extendedBy: string; previousDeadline: Date | null; newDeadline: Date; reason?: string }
  ) {
    return this.prismaService.schedule.update({
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

  // ----- pages -----
  createPage(chapterId: string, data: { pageNumber: number; originalFile: string }) {
    return this.prismaService.page.create({
      data: { chapterId, pageNumber: data.pageNumber, originalFile: data.originalFile, status: PageStatus.DRAFT }
    })
  }
  findPageById(id: string) {
    return this.prismaService.page.findUnique({ where: { id } })
  }
  findPagesByChapterId(chapterId: string) {
    return this.prismaService.page.findMany({ where: { chapterId }, orderBy: { pageNumber: 'asc' } })
  }
  updatePage(id: string, data: { compositeFile?: string }) {
    return this.prismaService.page.update({ where: { id }, data })
  }
  updatePageStatus(id: string, status: PageStatus) {
    return this.prismaService.page.update({ where: { id }, data: { status } })
  }
  // ----- co-owner approval (A-CHP-06 / B-TRF-05) -----
  createCoOwnerApproval(data: { chapterId: string; coOwnerId: string; deadline: Date }) {
    return this.prismaService.chapterCoOwnerApproval.create({
      data: {
        chapterId: data.chapterId,
        coOwnerId: data.coOwnerId,
        deadline: data.deadline,
        status: CoOwnerApprovalStatus.PENDING
      }
    })
  }
  async findCoOwnerApprovalByChapterId(chapterId: string) {
    // Lấy record mở gần nhất (an toàn nếu nhiều lần re-publish).
    const rows = await this.prismaService.chapterCoOwnerApproval.findMany({
      where: { chapterId },
      orderBy: { createdAt: 'desc' },
      take: 1
    })
    return rows[0] ?? null
  }
  updateCoOwnerApproval(
    id: string,
    data: {
      status: CoOwnerApprovalStatus
      decisionAt?: Date
      rejectReason?: string
      escalatedAt?: Date
    }
  ) {
    return this.prismaService.chapterCoOwnerApproval.update({ where: { id }, data })
  }
  // Escalate cron: record PENDING quá hạn, chưa escalate.
  findOverdueCoOwnerApprovals(now: Date) {
    return this.prismaService.chapterCoOwnerApproval.findMany({
      where: { status: CoOwnerApprovalStatus.PENDING, deadline: { lt: now }, escalatedAt: { isSet: false } }
    })
  }
  // Board recipients cho escalate — resolve roleId trước (Mongo tránh relation-filter, bám users.repo).
  async findBoardMemberIds(): Promise<string[]> {
    const role = await this.prismaService.role.findFirst({ where: { code: 'BOARD_MEMBER' }, select: { id: true } })
    if (!role) return []
    const users = await this.prismaService.user.findMany({
      where: { roleId: role.id, deletedAt: { isSet: false } },
      select: { id: true }
    })
    return users.map((u) => u.id)
  }
}
