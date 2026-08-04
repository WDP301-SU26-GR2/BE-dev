import { AvailabilityStatus, Prisma, UserStatus } from '@prisma/client'
import { RoleName } from 'src/core/security/constants/role.constant'
import { PrismaService } from 'src/infrastructure/database/prisma.service'
import { AssistantDirectoryFilter, MangakaDirectoryFilter } from './users-repository.types'

export class UserDirectoryRepository {
  constructor(private readonly prismaService: PrismaService) {}

  private async findActiveUserIds(roleCode: string, q?: string): Promise<string[]> {
    const role = await this.prismaService.role.findFirst({ where: { code: roleCode }, select: { id: true } })
    if (!role) return []
    const users = await this.prismaService.user.findMany({
      where: {
        roleId: role.id,
        status: UserStatus.ACTIVE,
        deletedAt: { isSet: false },
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { displayName: { contains: q, mode: 'insensitive' } }
              ]
            }
          : {})
      },
      select: { id: true }
    })
    return users.map((user) => user.id)
  }

  private buildAssistantWhere(
    activeIds: string[],
    filter: AssistantDirectoryFilter
  ): Prisma.AssistantProfileWhereInput {
    const availabilityWindow =
      filter.availableFrom && filter.availableTo
        ? {
            availabilityStatus: AvailabilityStatus.AVAILABLE,
            AND: [
              { OR: [{ availabilityFrom: null }, { availabilityFrom: { lte: new Date(filter.availableTo) } }] },
              { OR: [{ availabilityTo: null }, { availabilityTo: { gte: new Date(filter.availableFrom) } }] }
            ]
          }
        : {}
    return {
      userId: { in: activeIds },
      ...(filter.specialization ? { specializations: { has: filter.specialization } } : {}),
      ...(filter.level ? { experienceLevel: filter.level } : {}),
      ...availabilityWindow
    }
  }

  async findAssistantsForDirectory(filter: AssistantDirectoryFilter, page: { limit: number; offset: number }) {
    const activeIds = await this.findActiveUserIds(RoleName.ASSISTANT, filter.q)
    if (activeIds.length === 0) return []
    return this.prismaService.assistantProfile.findMany({
      where: this.buildAssistantWhere(activeIds, filter),
      orderBy: [{ isRecommended: 'desc' }, { reputationScore: 'desc' }, { ratingCount: 'desc' }],
      skip: page.offset,
      take: page.limit,
      include: { user: { select: { displayName: true, avatar: true, email: true, phoneNumber: true } } }
    })
  }

  async countAssistantsForDirectory(filter: AssistantDirectoryFilter): Promise<number> {
    const activeIds = await this.findActiveUserIds(RoleName.ASSISTANT, filter.q)
    if (activeIds.length === 0) return 0
    return this.prismaService.assistantProfile.count({ where: this.buildAssistantWhere(activeIds, filter) })
  }

  private async buildMangakaWhere(filter: MangakaDirectoryFilter): Promise<Prisma.MangakaProfileWhereInput | null> {
    const activeIds = await this.findActiveUserIds(RoleName.MANGAKA)
    if (activeIds.length === 0) return null
    const base: Prisma.MangakaProfileWhereInput = {
      userId: { in: activeIds },
      ...(filter.genre ? { genres: { has: filter.genre } } : {}),
      ...(filter.level ? { experienceLevel: filter.level } : {})
    }
    if (!filter.q) return base
    const nameMatchedIds = await this.findActiveUserIds(RoleName.MANGAKA, filter.q)
    return {
      ...base,
      OR: [{ penName: { contains: filter.q, mode: 'insensitive' } }, { userId: { in: nameMatchedIds } }]
    }
  }

  async findMangakasForDirectory(filter: MangakaDirectoryFilter, page: { limit: number; offset: number }) {
    const where = await this.buildMangakaWhere(filter)
    if (!where) return []
    return this.prismaService.mangakaProfile.findMany({
      where,
      orderBy: [{ isRecommended: 'desc' }, { reputationScore: 'desc' }, { ratingCount: 'desc' }],
      skip: page.offset,
      take: page.limit,
      include: { user: { select: { displayName: true, avatar: true, email: true, phoneNumber: true } } }
    })
  }

  async countMangakasForDirectory(filter: MangakaDirectoryFilter): Promise<number> {
    const where = await this.buildMangakaWhere(filter)
    if (!where) return 0
    return this.prismaService.mangakaProfile.count({ where })
  }
}
