import { ChapterStatus } from '@prisma/client'
import { RoleNameType } from 'src/core/security/constants/role.constant'
import { PrismaService } from 'src/infrastructure/database/prisma.service'
import { UserRoleCountRow } from './users-repository.types'

export class UserAdminStatsRepository {
  constructor(private readonly prismaService: PrismaService) {}

  groupUsersByStatus() {
    return this.prismaService.user.groupBy({
      by: ['status'],
      where: { deletedAt: { isSet: false } },
      _count: { _all: true }
    })
  }

  async groupUsersByRole(): Promise<UserRoleCountRow[]> {
    const [roles, rows] = await Promise.all([
      this.prismaService.role.findMany({ select: { id: true, code: true } }),
      this.prismaService.user.groupBy({
        by: ['roleId'],
        where: { deletedAt: { isSet: false } },
        _count: { _all: true }
      })
    ])
    const codeById = new Map(roles.map((role) => [role.id, role.code as RoleNameType]))
    return rows.flatMap((row) => {
      const code = codeById.get(row.roleId)
      return code ? [{ role: { code }, _count: row._count }] : []
    })
  }

  countDeletedUsers(): Promise<number> {
    return this.prismaService.user.count({ where: { deletedAt: { isSet: true } } })
  }

  groupSeriesByStatus() {
    return this.prismaService.series.groupBy({ by: ['status'], _count: { _all: true } })
  }

  async countChapters(): Promise<{ total: number; published: number }> {
    const [total, published] = await Promise.all([
      this.prismaService.chapter.count(),
      this.prismaService.chapter.count({ where: { status: ChapterStatus.PUBLISHED } })
    ])
    return { total, published }
  }

  groupTasksByStatus() {
    return this.prismaService.task.groupBy({ by: ['status'], _count: { _all: true } })
  }
}
