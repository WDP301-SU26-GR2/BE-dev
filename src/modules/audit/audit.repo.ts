import { Injectable } from '@nestjs/common'
import { AuditEntityType, Prisma } from '@prisma/client'
import { PrismaService } from 'src/infrastructure/database/prisma.service'

export type AuditListWhere = Prisma.AuditLogWhereInput

@Injectable()
export class AuditRepository {
  constructor(private readonly prismaService: PrismaService) {}

  create(data: {
    actorId: string | null
    entityType: AuditEntityType
    entityId: string
    action: string
    fromState: string | null
    toState: string | null
    reason: string | null
  }) {
    return this.prismaService.auditLog.create({ data })
  }

  findMany(where: AuditListWhere, page: { limit: number; offset: number }) {
    return this.prismaService.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: page.offset,
      take: page.limit
    })
  }

  count(where: AuditListWhere) {
    return this.prismaService.auditLog.count({ where })
  }
}
