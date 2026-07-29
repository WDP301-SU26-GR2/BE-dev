import { Injectable } from '@nestjs/common'
import { ChapterStatus, Demographic, Genre, PublicationType, SeriesStatus, UserStatus } from '@prisma/client'
import { PrismaService } from 'src/infrastructure/database/prisma.service'
import { PUBLIC_SERIES_STATUSES } from './public.constant'

const escapeMongoRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

@Injectable()
export class PublicRepository {
  constructor(private readonly prisma: PrismaService) {}

  private publicSeriesWhere(extra: Record<string, unknown> = {}) {
    return { status: { in: PUBLIC_SERIES_STATUSES }, ...extra }
  }

  async findPublicSeries(input: {
    q?: string
    genre?: Genre
    demographic?: Demographic
    publicationType?: PublicationType
    status?: SeriesStatus
    limit: number
    offset: number
  }) {
    // status truyền vào ĐÃ được schema giới hạn trong PUBLIC_SERIES_STATUSES (subset enum) → an toàn
    // override guard `{ in: [...] }`. Không có → giữ toàn bộ public set. Cho FE tách tab
    // "đang phát hành" (status=SERIALIZED) khỏi "đã hoàn thành" (status=COMPLETED) bằng 1 param.
    const where = this.publicSeriesWhere({
      ...(input.status ? { status: input.status } : {}),
      ...(input.q ? { title: { contains: escapeMongoRegex(input.q), mode: 'insensitive' as const } } : {}),
      ...(input.genre ? { genres: { has: input.genre } } : {}),
      ...(input.demographic ? { demographic: input.demographic } : {}),
      ...(input.publicationType ? { publicationType: input.publicationType } : {})
    })
    const [series, total] = await Promise.all([
      this.prisma.series.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: input.offset,
        take: input.limit
      }),
      this.prisma.series.count({ where })
    ])

    return { items: await this.attachPublicAuthors(series), total }
  }

  async countPublishedChaptersBySeriesIds(seriesIds: string[]): Promise<Map<string, number>> {
    if (seriesIds.length === 0) return new Map()
    const rows = await this.prisma.chapter.groupBy({
      by: ['seriesId'],
      where: { seriesId: { in: seriesIds }, status: ChapterStatus.PUBLISHED },
      _count: { _all: true }
    })

    return new Map(rows.map((row) => [row.seriesId, row._count._all]))
  }

  async findPublicSeriesById(id: string) {
    const series = await this.prisma.series.findFirst({ where: this.publicSeriesWhere({ id }) })
    if (!series) return null
    return (await this.attachPublicAuthors([series]))[0] ?? null
  }

  findPublishedChaptersBySeriesId(seriesId: string) {
    return this.prisma.chapter.findMany({
      where: { seriesId, status: ChapterStatus.PUBLISHED },
      orderBy: { chapterNumber: 'asc' },
      select: { id: true, chapterNumber: true, title: true, publishedAt: true }
    })
  }

  findPublishedChapterById(id: string) {
    return this.prisma.chapter.findFirst({
      where: { id, status: ChapterStatus.PUBLISHED },
      select: { id: true, seriesId: true, chapterNumber: true, title: true, publishedAt: true }
    })
  }

  findPagesByChapterId(chapterId: string) {
    return this.prisma.page.findMany({
      where: { chapterId },
      orderBy: { pageNumber: 'asc' },
      select: { pageNumber: true, originalFile: true, compositeFile: true }
    })
  }

  findAdjacentPublishedChapter(seriesId: string, chapterNumber: number, direction: 'prev' | 'next') {
    return this.prisma.chapter.findFirst({
      where: {
        seriesId,
        status: ChapterStatus.PUBLISHED,
        chapterNumber: direction === 'prev' ? { lt: chapterNumber } : { gt: chapterNumber }
      },
      orderBy: { chapterNumber: direction === 'prev' ? 'desc' : 'asc' },
      select: { id: true }
    })
  }

  /**
   * Public catalog exposes an author's opted-in display name only. It never
   * returns the User model, so private identifiers and contact data stay out
   * of the public response contract.
   */
  private async attachPublicAuthors<T extends { mangakaId: string }>(series: T[]) {
    if (series.length === 0) return []

    const authorIds = [...new Set(series.map((item) => item.mangakaId))]
    const authors = await this.prisma.user.findMany({
      where: {
        id: { in: authorIds },
        status: UserStatus.ACTIVE,
        deletedAt: { isSet: false }
      },
      select: { id: true, displayName: true }
    })
    const authorById = new Map(authors.map((author) => [author.id, { displayName: author.displayName }]))

    return series.map((item) => ({ ...item, author: authorById.get(item.mangakaId) ?? null }))
  }
}
