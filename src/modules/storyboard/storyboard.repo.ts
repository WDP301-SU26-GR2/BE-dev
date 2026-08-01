import { Injectable } from '@nestjs/common'
import { StoryboardStatus } from '@prisma/client'
import { PrismaService } from 'src/infrastructure/database/prisma.service'

@Injectable()
export class StoryboardRepo {
  constructor(private readonly prisma: PrismaService) {}

  findStoryboardById(storyboardId: string) {
    return this.prisma.storyboard.findUnique({ where: { id: storyboardId } })
  }

  findStoryboardsByChapterId(chapterId: string) {
    return this.prisma.storyboard.findMany({ where: { chapterId }, orderBy: { version: 'asc' } })
  }

  updateStoryboardStatus(
    storyboardId: string,
    data: { status: StoryboardStatus; version?: number; submittedAt?: Date }
  ) {
    return this.prisma.storyboard.update({ where: { id: storyboardId }, data })
  }

  updateStoryboardPages(storyboardId: string, pages: { pageNumber: number; fileUrl: string }[]) {
    return this.prisma.storyboard.update({ where: { id: storyboardId }, data: { pages: { set: pages } } })
  }

  appendStoryboardPage(storyboardId: string, page: { pageNumber: number; fileUrl: string }) {
    return this.prisma.storyboard.update({ where: { id: storyboardId }, data: { pages: { push: page } } })
  }

  // Đọc Series cho guard (owner/editor/status) — Storyboard module self-sufficient, không phụ thuộc SeriesService.
  // Series không có field deletedAt hệ thống → guard tối thiểu theo id (xem series-query.findById cũ).
  findSeriesForGuard(seriesId: string) {
    return this.prisma.series.findFirst({
      where: { id: seriesId },
      select: { id: true, mangakaId: true, editorId: true, status: true }
    })
  }

  findChapterForStoryboardGuard(chapterId: string) {
    return this.prisma.chapter.findFirst({
      where: { id: chapterId },
      select: {
        id: true,
        seriesId: true,
        status: true,
        storyboardId: true,
        series: { select: { mangakaId: true, status: true } }
      }
    })
  }

  async createChapterStoryboardForChapter(data: {
    chapterId: string
    seriesId: string
    storyboardPages: { pageNumber: number; fileUrl: string }[]
  }) {
    return this.prisma.$transaction(async (tx) => {
      const storyboard = await tx.storyboard.create({
        data: {
          seriesId: data.seriesId,
          chapterId: data.chapterId,
          // Spec 28 Option A: born DRAFT (Mangaka sửa pages thoải mái) → submit tường minh mới sang SUBMITTED.
          status: StoryboardStatus.DRAFT,
          pages: data.storyboardPages
        }
      })
      await tx.chapter.update({
        where: { id: data.chapterId },
        data: { storyboardId: storyboard.id }
      })
      return storyboard
    })
  }

  // Xoá chapter-storyboard + gỡ con trỏ trên Chapter. Dùng `unset` (Mongo) để field về absent —
  // cùng pattern với series release editorId (PROGRESS §16).
  async deleteChapterStoryboard(chapterId: string, storyboardId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.storyboard.delete({ where: { id: storyboardId } })
      await tx.chapter.update({
        where: { id: chapterId },
        data: { storyboardId: { unset: true } }
      })
    })
  }
}
