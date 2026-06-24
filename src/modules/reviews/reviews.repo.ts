import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/infrastructure/database/prisma.service'

@Injectable()
export class ReviewsRepository {
  constructor(private readonly prismaService: PrismaService) {}

  // ---- Assistant reviews (Mangaka -> Assistant) ----
  async upsertAssistantReview(data: {
    mangakaId: string
    assistantId: string
    rating: number
    comment: string | null
    studioAssignmentId: string | null
    seriesId: string | null
  }) {
    return await this.prismaService.assistantReview.upsert({
      where: { mangakaId_assistantId: { mangakaId: data.mangakaId, assistantId: data.assistantId } },
      create: {
        mangakaId: data.mangakaId,
        assistantId: data.assistantId,
        rating: data.rating,
        comment: data.comment,
        studioAssignmentId: data.studioAssignmentId,
        seriesId: data.seriesId
      },
      update: {
        rating: data.rating,
        comment: data.comment,
        studioAssignmentId: data.studioAssignmentId,
        seriesId: data.seriesId
      }
    })
  }

  async aggregateAssistantReviews(assistantId: string): Promise<{ sum: number; count: number }> {
    const res = await this.prismaService.assistantReview.aggregate({
      where: { assistantId },
      _sum: { rating: true },
      _count: { _all: true }
    })
    return { sum: res._sum.rating ?? 0, count: res._count._all }
  }

  async listAssistantReviews(assistantId: string, options?: { limit?: number; offset?: number }) {
    return await this.prismaService.assistantReview.findMany({
      where: { assistantId },
      orderBy: { createdAt: 'desc' },
      take: options?.limit,
      skip: options?.offset
    })
  }

  async findUserDisplayMap(userIds: string[]) {
    const uniqueIds = [...new Set(userIds)]
    if (uniqueIds.length === 0)
      return new Map<string, { id: string; displayName: string | null; avatar: string | null }>()

    const users = await this.prismaService.user.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, displayName: true, avatar: true }
    })

    return new Map(users.map((user) => [user.id, user]))
  }

  // ---- Mangaka reviews (Editor -> Mangaka) ----
  async upsertMangakaReview(data: {
    editorId: string
    mangakaId: string
    rating: number
    comment: string | null
    seriesId: string | null
  }) {
    return await this.prismaService.mangakaReview.upsert({
      where: { editorId_mangakaId: { editorId: data.editorId, mangakaId: data.mangakaId } },
      create: data,
      update: { rating: data.rating, comment: data.comment, seriesId: data.seriesId }
    })
  }

  async aggregateMangakaReviews(mangakaId: string): Promise<{ sum: number; count: number }> {
    const res = await this.prismaService.mangakaReview.aggregate({
      where: { mangakaId },
      _sum: { rating: true },
      _count: { _all: true }
    })
    return { sum: res._sum.rating ?? 0, count: res._count._all }
  }

  async listMangakaReviews(mangakaId: string, options?: { limit?: number; offset?: number }) {
    return await this.prismaService.mangakaReview.findMany({
      where: { mangakaId },
      orderBy: { createdAt: 'desc' },
      take: options?.limit,
      skip: options?.offset
    })
  }
}
