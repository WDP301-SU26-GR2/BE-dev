import { CoOwnerApprovalStatus, NameStatus, PageStatus } from '@prisma/client'
import { PrismaService } from 'src/infrastructure/database/prisma.service'

export class ChapterQueryRepository {
  constructor(private readonly prisma: PrismaService) {}

  findSeriesById(seriesId: string) {
    return this.prisma.series.findUnique({ where: { id: seriesId } })
  }
  findNameById(nameId: string) {
    return this.prisma.name.findUnique({ where: { id: nameId } })
  }
  countChaptersBySeriesId(seriesId: string) {
    return this.prisma.chapter.count({ where: { seriesId } })
  }
  findExecutedContractBySeriesId(seriesId: string) {
    return this.prisma.contract.findFirst({
      where: { seriesId, status: 'FULLY_EXECUTED' },
      select: { id: true }
    })
  }
  findChapterById(id: string) {
    return this.prisma.chapter.findUnique({ where: { id } })
  }
  findChapterWithRelations(id: string) {
    return this.prisma.chapter.findUnique({
      where: { id },
      include: { manuscript: true, schedule: true }
    })
  }
  findChapterWithSeries(id: string) {
    return this.prisma.chapter.findFirst({
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
  findChaptersBySeriesId(seriesId: string) {
    return this.prisma.chapter.findMany({
      where: { seriesId },
      include: { manuscript: true, schedule: true },
      orderBy: { chapterNumber: 'asc' }
    })
  }
  findChapterByNumber(seriesId: string, chapterNumber: number) {
    return this.prisma.chapter.findFirst({ where: { seriesId, chapterNumber } })
  }
  findManuscriptByChapterId(chapterId: string) {
    return this.prisma.manuscript.findUnique({ where: { chapterId } })
  }
  async findSeriesRecipients(seriesId: string): Promise<{ mangakaId: string; editorId: string | null } | null> {
    const series = await this.prisma.series.findUnique({
      where: { id: seriesId },
      select: { mangakaId: true, editorId: true }
    })
    return series ? { mangakaId: series.mangakaId, editorId: series.editorId ?? null } : null
  }
  async findNameStatus(nameId: string): Promise<NameStatus | null> {
    const name = await this.prisma.name.findUnique({ where: { id: nameId }, select: { status: true } })
    return name?.status ?? null
  }
  findScheduleByChapterId(chapterId: string) {
    return this.prisma.schedule.findUnique({ where: { chapterId } })
  }
  findPageById(id: string) {
    return this.prisma.page.findUnique({ where: { id } })
  }
  findPagesByChapterId(chapterId: string) {
    return this.prisma.page.findMany({ where: { chapterId }, orderBy: { pageNumber: 'asc' } })
  }
  findPageByChapterAndNumber(chapterId: string, pageNumber: number) {
    return this.prisma.page.findFirst({ where: { chapterId, pageNumber } })
  }
  countPagesNotCompleted(chapterId: string) {
    return this.prisma.page.count({ where: { chapterId, status: { not: PageStatus.COMPLETED } } })
  }
  findPagesByIds(ids: string[]) {
    return this.prisma.page.findMany({ where: { id: { in: ids } } })
  }
  findTasksByPage(pageId: string) {
    return this.prisma.task.findMany({
      where: { pageId },
      select: { id: true, status: true, assistantId: true }
    })
  }
  findTasksByPages(pageIds: string[]) {
    return this.prisma.task.findMany({
      where: { pageId: { in: pageIds } },
      select: { id: true, status: true, assistantId: true }
    })
  }
  async findCoOwnerApprovalByChapterId(chapterId: string) {
    const rows = await this.prisma.chapterCoOwnerApproval.findMany({
      where: { chapterId },
      orderBy: { createdAt: 'desc' },
      take: 1
    })
    return rows[0] ?? null
  }
  findOverdueCoOwnerApprovals(now: Date) {
    return this.prisma.chapterCoOwnerApproval.findMany({
      where: { status: CoOwnerApprovalStatus.PENDING, deadline: { lt: now }, escalatedAt: { isSet: false } }
    })
  }
  async findBoardMemberIds() {
    const role = await this.prisma.role.findFirst({ where: { code: 'BOARD_MEMBER' }, select: { id: true } })
    if (!role) return []
    const users = await this.prisma.user.findMany({
      where: { roleId: role.id, deletedAt: { isSet: false } },
      select: { id: true }
    })
    return users.map((user) => user.id)
  }
}
