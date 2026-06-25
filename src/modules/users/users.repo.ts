import { Injectable } from '@nestjs/common'
import { AvailabilityStatus, Prisma, RegistrationType, UserStatus } from '@prisma/client'
import { RoleNameType } from 'src/core/security/role.constant'
import { PrismaService } from 'src/infrastructure/database/prisma.service'
import { AssistantProfileBodyType, MangakaProfileBodyType } from './schemas/users-schemas'

// ---- Admin user listing ----

export type AdminUserFilter = {
  excludeUserId?: string
  roleCode?: RoleNameType
  status?: UserStatus
  search?: string
  includeDeleted?: boolean
}

// Whitelist field trả ra cho admin — KHÔNG bao giờ chứa password.
const ADMIN_USER_SELECT = {
  id: true,
  email: true,
  name: true,
  displayName: true,
  phoneNumber: true,
  avatar: true,
  status: true,
  emailVerified: true,
  registrationType: true,
  mustChangePassword: true,
  createdAt: true,
  role: { select: { code: true } }
} satisfies Prisma.UserSelect

@Injectable()
export class UsersRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async getRoleIdByCode(code: RoleNameType): Promise<string> {
    const role = await this.prismaService.role.findUniqueOrThrow({ where: { code } })
    return role.id
  }

  async createAdminUser(data: { email: string; name: string; phoneNumber: string; password: string; roleId: string }) {
    return await this.prismaService.user.create({
      data: {
        ...data,
        status: UserStatus.ACTIVE,
        emailVerified: true,
        registrationType: RegistrationType.ADMIN_CREATED,
        mustChangePassword: true
      },
      omit: { password: true }
    })
  }

  async upsertMangakaProfile(userId: string, data: MangakaProfileBodyType) {
    return await this.prismaService.mangakaProfile.upsert({
      where: { userId },
      create: {
        userId,
        penName: data.penName,
        genres: data.genres,
        experienceLevel: data.experienceLevel ?? null,
        bio: data.bio ?? null,
        portfolioFiles: data.portfolioFiles
      },
      update: {
        penName: data.penName,
        genres: data.genres,
        experienceLevel: data.experienceLevel ?? null,
        bio: data.bio ?? null,
        portfolioFiles: data.portfolioFiles
      }
    })
  }

  async findMangakaProfileByUserId(userId: string) {
    return await this.prismaService.mangakaProfile.findUnique({
      where: { userId },
      include: { user: { select: { displayName: true, avatar: true } } }
    })
  }

  async upsertAssistantProfile(userId: string, data: AssistantProfileBodyType) {
    return await this.prismaService.assistantProfile.upsert({
      where: { userId },
      create: {
        userId,
        specializations: data.specializations,
        experienceLevel: data.experienceLevel ?? null,
        portfolioFiles: data.portfolioFiles,
        availabilityStatus: data.availabilityStatus ?? AvailabilityStatus.AVAILABLE,
        availabilityFrom: data.availabilityFrom ? new Date(data.availabilityFrom) : null,
        availabilityTo: data.availabilityTo ? new Date(data.availabilityTo) : null
      },
      update: {
        specializations: data.specializations,
        experienceLevel: data.experienceLevel ?? null,
        portfolioFiles: data.portfolioFiles,
        availabilityStatus: data.availabilityStatus,
        availabilityFrom: data.availabilityFrom ? new Date(data.availabilityFrom) : null,
        availabilityTo: data.availabilityTo ? new Date(data.availabilityTo) : null
      }
    })
  }

  async findAssistantProfileByUserId(userId: string) {
    return await this.prismaService.assistantProfile.findUnique({
      where: { userId },
      include: { user: { select: { displayName: true, avatar: true } } }
    })
  }

  async updateMangakaReputation(
    userId: string,
    data: { ratingAvg: number; ratingCount: number; reputationScore: number; isRecommended: boolean }
  ): Promise<void> {
    await this.prismaService.mangakaProfile.update({ where: { userId }, data })
  }

  async updateAssistantReputation(
    userId: string,
    data: { ratingAvg: number; ratingCount: number; reputationScore: number; isRecommended: boolean }
  ): Promise<void> {
    await this.prismaService.assistantProfile.update({ where: { userId }, data })
  }

  // Mongo: tránh relation-filter; resolve roleId từ roleCode trước.
  private async buildAdminUserWhere(f: AdminUserFilter): Promise<Prisma.UserWhereInput> {
    let roleId: string | undefined
    if (f.roleCode) {
      const role = await this.prismaService.role.findFirst({ where: { code: f.roleCode }, select: { id: true } })
      // roleCode hợp lệ nhưng không có Role doc → id không tồn tại để ra tập rỗng.
      roleId = role?.id ?? '000000000000000000000000'
    }
    return {
      ...(f.excludeUserId ? { id: { not: f.excludeUserId } } : {}),
      ...(roleId ? { roleId } : {}),
      ...(f.status ? { status: f.status } : {}),
      // Prisma+Mongo: user chưa từng bị xoá có field deletedAt ABSENT (không phải null) →
      // `{ deletedAt: null }` KHÔNG match (trả rỗng). Phải dùng `{ isSet: false }`.
      ...(f.includeDeleted ? {} : { deletedAt: { isSet: false } }),
      ...(f.search
        ? {
            OR: [
              { email: { contains: f.search, mode: 'insensitive' } },
              { name: { contains: f.search, mode: 'insensitive' } },
              { displayName: { contains: f.search, mode: 'insensitive' } }
            ]
          }
        : {})
    }
  }

  async findUsersForAdmin(filter: AdminUserFilter, page: { limit: number; offset: number }) {
    const where = await this.buildAdminUserWhere(filter)
    return await this.prismaService.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: page.offset,
      take: page.limit,
      select: ADMIN_USER_SELECT
    })
  }

  async countUsersForAdmin(filter: AdminUserFilter): Promise<number> {
    const where = await this.buildAdminUserWhere(filter)
    return await this.prismaService.user.count({ where })
  }

  async findUserByIdForAdmin(id: string) {
    return await this.prismaService.user.findUnique({ where: { id }, select: ADMIN_USER_SELECT })
  }
}
