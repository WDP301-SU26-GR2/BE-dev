import { Injectable } from '@nestjs/common'
import { Prisma, RevisionTargetType } from '@prisma/client'
import { PrismaService } from 'src/infrastructure/database/prisma.service'
import { fetchSeriesMiniMap, fetchUserMiniMap } from 'src/core/models/user-mini.model'

export type RevisionListWhere = Prisma.RevisionRequestWhereInput

@Injectable()
export class RevisionRepository {
  constructor(private readonly prismaService: PrismaService) {}

  private async attachContext<T extends { requestedBy: string; recipientId: string; seriesId: string | null }>(
    rows: T[]
  ) {
    const [users, series] = await Promise.all([
      fetchUserMiniMap(
        this.prismaService,
        rows.flatMap((row) => [row.requestedBy, row.recipientId])
      ),
      fetchSeriesMiniMap(
        this.prismaService,
        rows.map((row) => row.seriesId)
      )
    ])
    return rows.map((row) => ({
      ...row,
      requester: users.get(row.requestedBy) ?? null,
      recipient: users.get(row.recipientId) ?? null,
      series: row.seriesId ? (series.get(row.seriesId) ?? null) : null
    }))
  }

  create(data: {
    targetType: RevisionTargetType
    targetId: string
    seriesId: string | null
    round: number
    reason: string
    requestedBy: string
    recipientId: string
  }) {
    return this.prismaService.revisionRequest.create({ data })
  }

  countByTarget(targetType: RevisionTargetType, targetId: string) {
    return this.prismaService.revisionRequest.count({ where: { targetType, targetId } })
  }

  async findById(id: string) {
    const row = await this.prismaService.revisionRequest.findUnique({ where: { id } })
    if (!row) return null
    return (await this.attachContext([row]))[0]
  }

  markResolvedIfOpen(id: string, resolvedBy: string) {
    return this.prismaService.revisionRequest.updateMany({
      where: { id, recipientId: resolvedBy, isResolved: false },
      data: { isResolved: true, resolvedAt: new Date(), resolvedBy }
    })
  }

  async findMany(where: RevisionListWhere, page: { limit: number; offset: number }) {
    const rows = await this.prismaService.revisionRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: page.offset,
      take: page.limit
    })
    return this.attachContext(rows)
  }

  count(where: RevisionListWhere) {
    return this.prismaService.revisionRequest.count({ where })
  }

  countOpenForRecipient(recipientId: string) {
    return this.prismaService.revisionRequest.count({ where: { recipientId, isResolved: false } })
  }

  countOpenByTarget(targetType: RevisionTargetType, targetId: string) {
    return this.prismaService.revisionRequest.count({ where: { targetType, targetId, isResolved: false } })
  }
}
