import { Injectable } from '@nestjs/common'
import { Prisma, RevisionTargetType } from '@prisma/client'
import { PrismaService } from 'src/infrastructure/database/prisma.service'

export type RevisionListWhere = Prisma.RevisionRequestWhereInput

@Injectable()
export class RevisionRepository {
  constructor(private readonly prismaService: PrismaService) {}

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

  findById(id: string) {
    return this.prismaService.revisionRequest.findUnique({ where: { id } })
  }

  markResolvedIfOpen(id: string, resolvedBy: string) {
    return this.prismaService.revisionRequest.updateMany({
      where: { id, recipientId: resolvedBy, isResolved: false },
      data: { isResolved: true, resolvedAt: new Date(), resolvedBy }
    })
  }

  findMany(where: RevisionListWhere, page: { limit: number; offset: number }) {
    return this.prismaService.revisionRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: page.offset,
      take: page.limit
    })
  }

  count(where: RevisionListWhere) {
    return this.prismaService.revisionRequest.count({ where })
  }

  countOpenForRecipient(recipientId: string) {
    return this.prismaService.revisionRequest.count({ where: { recipientId, isResolved: false } })
  }
}
