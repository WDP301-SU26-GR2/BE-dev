import { Injectable } from '@nestjs/common'
import { NameKind, NameStatus } from '@prisma/client'
import { PrismaService } from 'src/infrastructure/database/prisma.service'

@Injectable()
export class NameRepo {
  constructor(private readonly prisma: PrismaService) {}

  findNameById(nameId: string) {
    return this.prisma.name.findUnique({ where: { id: nameId } })
  }

  findNamesBySeriesId(seriesId: string) {
    return this.prisma.name.findMany({ where: { seriesId }, orderBy: { version: 'asc' } })
  }

  findNamesBySeriesIdAndKind(seriesId: string, kind: NameKind) {
    return this.prisma.name.findMany({ where: { seriesId, kind }, orderBy: { version: 'asc' } })
  }

  updateNameStatus(nameId: string, data: { status: NameStatus; version?: number; submittedAt?: Date }) {
    return this.prisma.name.update({ where: { id: nameId }, data })
  }

  updateNamePages(nameId: string, pages: { pageNumber: number; fileUrl: string }[]) {
    return this.prisma.name.update({ where: { id: nameId }, data: { pages: { set: pages } } })
  }

  appendNamePage(nameId: string, page: { pageNumber: number; fileUrl: string }) {
    return this.prisma.name.update({ where: { id: nameId }, data: { pages: { push: page } } })
  }

  createChapterName(
    seriesId: string,
    data: { chapterNumber: number; namePages: { pageNumber: number; fileUrl: string }[] }
  ) {
    return this.prisma.name.create({
      data: {
        seriesId,
        kind: NameKind.CHAPTER,
        chapterNumber: data.chapterNumber,
        status: NameStatus.SUBMITTED,
        pages: data.namePages
      }
    })
  }

  countChapterNameByNumber(seriesId: string, chapterNumber: number) {
    return this.prisma.name.count({ where: { seriesId, kind: NameKind.CHAPTER, chapterNumber } })
  }

  // Đọc Series cho guard (owner/editor/status) — Name module self-sufficient, không phụ thuộc SeriesService.
  // Series không có field deletedAt hệ thống → guard tối thiểu theo id (xem series-query.findById cũ).
  findSeriesForGuard(seriesId: string) {
    return this.prisma.series.findFirst({
      where: { id: seriesId },
      select: { id: true, mangakaId: true, editorId: true, status: true }
    })
  }
}
