import { Injectable } from '@nestjs/common'
import { DeadlineRequestStatus, Prisma } from '@prisma/client'
import { PrismaService } from 'src/infrastructure/database/prisma.service'
import { DeadlineSide, DEADLINE_CLOSED_STATES, DEADLINE_RESOLVED_STATES } from './deadline.constant'
import { ChapterMiniType, fetchSeriesMiniMap } from 'src/core/models/user-mini.model'

export interface CreateDeadlineRequestData {
  scheduleId: string
  chapterId: string
  seriesId: string
  requestedBy: DeadlineSide
  currentDeadline: Date | null
  requestedDeadline: Date
  reason: string
  affectsSlot: boolean
  createdById: string
}

@Injectable()
export class DeadlineRepository {
  constructor(private readonly prismaService: PrismaService) {}

  private async attachContext<T extends { chapterId: string | null; seriesId: string | null }>(rows: T[]) {
    const chapterIds = [...new Set(rows.map((row) => row.chapterId).filter((id): id is string => Boolean(id)))]
    const chaptersPromise: Promise<ChapterMiniType[]> =
      chapterIds.length === 0
        ? Promise.resolve([])
        : this.prismaService.chapter.findMany({
            where: { id: { in: chapterIds } },
            select: { id: true, chapterNumber: true, title: true }
          })
    const [series, chapters] = await Promise.all([
      fetchSeriesMiniMap(
        this.prismaService,
        rows.map((row) => row.seriesId)
      ),
      chaptersPromise
    ])
    const chapterMap = new Map(chapters.map((chapter) => [chapter.id, chapter] as const))
    return rows.map((row) => ({
      ...row,
      series: row.seriesId ? (series.get(row.seriesId) ?? null) : null,
      chapter: row.chapterId ? (chapterMap.get(row.chapterId) ?? null) : null
    }))
  }

  async findById(id: string) {
    const row = await this.prismaService.deadlineRequest.findUnique({ where: { id } })
    if (!row) return null
    return (await this.attachContext([row]))[0]
  }

  findOpenByChapter(chapterId: string) {
    return this.prismaService.deadlineRequest.findFirst({
      where: { chapterId, status: { notIn: DEADLINE_CLOSED_STATES } }
    })
  }

  async listByChapter(chapterId: string, status?: DeadlineRequestStatus) {
    const rows = await this.prismaService.deadlineRequest.findMany({
      where: { chapterId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' }
    })
    return this.attachContext(rows)
  }

  create(data: CreateDeadlineRequestData) {
    return this.prismaService.deadlineRequest.create({
      data: {
        scheduleId: data.scheduleId,
        chapterId: data.chapterId,
        seriesId: data.seriesId,
        requestedBy: data.requestedBy,
        lastProposedBy: data.requestedBy,
        currentDeadline: data.currentDeadline,
        requestedDeadline: data.requestedDeadline,
        reason: data.reason,
        affectsSlot: data.affectsSlot,
        status: DeadlineRequestStatus.PROPOSED,
        statusHistory: [
          {
            from: null,
            to: DeadlineRequestStatus.PROPOSED,
            by: data.createdById,
            reason: data.reason
          }
        ]
      }
    })
  }

  applyTransition(
    id: string,
    args: {
      from: DeadlineRequestStatus
      to: DeadlineRequestStatus
      by: string
      reason?: string | null
      extra?: Prisma.DeadlineRequestUpdateInput
    }
  ) {
    const resolvedAt = DEADLINE_RESOLVED_STATES.has(args.to) ? new Date() : undefined
    return this.prismaService.deadlineRequest.update({
      where: { id },
      data: {
        ...(args.extra ?? {}),
        status: args.to,
        resolvedAt,
        statusHistory: {
          push: {
            from: args.from,
            to: args.to,
            by: args.by,
            reason: args.reason ?? null
          }
        }
      }
    })
  }
}
