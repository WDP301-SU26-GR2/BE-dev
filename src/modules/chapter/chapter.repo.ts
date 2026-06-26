import { Injectable } from '@nestjs/common'
import { ChapterStatus, ManuscriptStatus, PageStatus } from '@prisma/client'
import { PrismaService } from 'src/infrastructure/database/prisma.service'
import { deriveChapterStatus } from './chapter.constant'

@Injectable()
export class ChapterRepository {
  constructor(private readonly prismaService: PrismaService) {}

  // ----- read-only cross-entity (precondition) -----
  findSeriesById(seriesId: string) {
    return this.prismaService.series.findUnique({ where: { id: seriesId } })
  }
  findNameById(nameId: string) {
    return this.prismaService.name.findUnique({ where: { id: nameId } })
  }

  // ----- chapter -----
  async createChapter(data: { seriesId: string; nameId: string; chapterNumber: number; title?: string | null }) {
    const chapter = await this.prismaService.chapter.create({
      data: {
        seriesId: data.seriesId,
        nameId: data.nameId,
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
      select: { chapterId: true, chapter: { select: { seriesId: true, status: true } } }
    })
    return schedules
      .filter((schedule) => schedule.chapter.status !== ChapterStatus.PUBLISHED)
      .map((schedule) => ({ chapterId: schedule.chapterId, seriesId: schedule.chapter.seriesId }))
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
      data: { chapterId, pageNumber: data.pageNumber, originalFile: data.originalFile, status: PageStatus.NOT_STARTED }
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
  countIncompletePages(chapterId: string) {
    return this.prismaService.page.count({ where: { chapterId, status: { not: PageStatus.COMPLETED } } })
  }
}
