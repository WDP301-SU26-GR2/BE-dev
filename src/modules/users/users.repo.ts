import { Injectable } from '@nestjs/common'
import { AvailabilityStatus, ChapterStatus, Prisma, RegistrationType, Specialization, UserStatus } from '@prisma/client'
import { RoleName, RoleNameType } from 'src/core/security/constants/role.constant'
import { PrismaService } from 'src/infrastructure/database/prisma.service'
import { AssistantProfileBodyType, MangakaProfileBodyType, StaffProfileBodyType } from './schemas/users-schemas'

// ---- Admin user listing ----

export type AdminUserFilter = {
  excludeUserId?: string
  roleCode?: RoleNameType
  status?: UserStatus
  search?: string
  includeDeleted?: boolean
}

// ---- Assistant directory (A-TSK-06) ----
export type AssistantDirectoryFilter = {
  specialization?: Specialization
  level?: string
  availableFrom?: string
  availableTo?: string
}

export type UserRoleCountRow = {
  role: { code: RoleNameType }
  _count: { _all: number }
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

// Whitelist field trả cho chính chủ (GET/PATCH /me) — KHÔNG bao giờ chứa password.
const ME_SELECT = {
  id: true,
  email: true,
  name: true,
  displayName: true,
  avatar: true,
  phoneNumber: true,
  status: true,
  emailVerified: true,
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

  // Lấy thông tin tối thiểu + role để verify khi profile absent (graceful no-profile).
  // Gotcha §10: lọc chưa-xoá-mềm bằng isSet:false, KHÔNG { deletedAt: null }.
  async findUserBasicsWithRole(userId: string) {
    return await this.prismaService.user.findFirst({
      where: { id: userId, deletedAt: { isSet: false } },
      select: { id: true, displayName: true, avatar: true, role: { select: { code: true } } }
    })
  }

  // Gotcha §10: lọc chưa-xoá-mềm bằng isSet:false, KHÔNG { deletedAt: null }.
  async findMeById(userId: string) {
    return await this.prismaService.user.findFirst({
      where: { id: userId, deletedAt: { isSet: false } },
      select: ME_SELECT
    })
  }

  async updateMe(userId: string, data: Prisma.UserUpdateInput) {
    return await this.prismaService.user.update({ where: { id: userId }, data, select: ME_SELECT })
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

  async upsertStaffProfile(userId: string, data: StaffProfileBodyType) {
    return await this.prismaService.staffProfile.upsert({
      where: { userId },
      create: {
        userId,
        specialtyGenres: data.specialtyGenres,
        demographics: data.demographics,
        bio: data.bio ?? null,
        yearsOfExperience: data.yearsOfExperience ?? null
      },
      update: {
        specialtyGenres: data.specialtyGenres,
        demographics: data.demographics,
        bio: data.bio ?? null,
        yearsOfExperience: data.yearsOfExperience ?? null
      }
    })
  }

  async findStaffProfileByUserId(userId: string) {
    return await this.prismaService.staffProfile.findUnique({
      where: { userId },
      include: { user: { select: { displayName: true, avatar: true, role: { select: { code: true } } } } }
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

  async findModerationTargetById(id: string) {
    return await this.prismaService.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        status: true,
        deletedAt: true,
        role: { select: { code: true } }
      }
    })
  }

  // select whitelist ADMIN_USER_SELECT — KHÔNG trả password ra service layer
  async updateUserStatus(id: string, status: UserStatus) {
    return await this.prismaService.user.update({ where: { id }, data: { status }, select: ADMIN_USER_SELECT })
  }

  async softDeleteUser(id: string, deletedAt: Date) {
    return await this.prismaService.user.update({ where: { id }, data: { deletedAt } })
  }

  async restoreUser(id: string) {
    return await this.prismaService.user.update({
      where: { id },
      data: { deletedAt: { unset: true } },
      select: ADMIN_USER_SELECT
    })
  }

  async resetUserPassword(id: string, password: string) {
    return await this.prismaService.user.update({
      where: { id },
      data: { password, mustChangePassword: true }
    })
  }

  async revokeRefreshTokensByUserId(userId: string) {
    return await this.prismaService.refreshToken.deleteMany({ where: { userId } })
  }

  async groupUsersByStatus() {
    return await this.prismaService.user.groupBy({
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

  async countDeletedUsers(): Promise<number> {
    return await this.prismaService.user.count({ where: { deletedAt: { isSet: true } } })
  }

  // Stats admin đọc chéo collection qua PrismaService — ngoại lệ read-only (spec 2026-07-04 §3.4)
  async groupSeriesByStatus() {
    return await this.prismaService.series.groupBy({ by: ['status'], _count: { _all: true } })
  }

  async countChapters(): Promise<{ total: number; published: number }> {
    const [total, published] = await Promise.all([
      this.prismaService.chapter.count(),
      this.prismaService.chapter.count({ where: { status: ChapterStatus.PUBLISHED } })
    ])
    return { total, published }
  }

  async groupTasksByStatus() {
    return await this.prismaService.task.groupBy({ by: ['status'], _count: { _all: true } })
  }

  // ---- Assistant directory (A-TSK-06) ----
  // Mongo: KHÔNG relation-filter — resolve roleId trước (bám buildAdminUserWhere).
  private async findActiveAssistantUserIds(): Promise<string[]> {
    const role = await this.prismaService.role.findFirst({ where: { code: RoleName.ASSISTANT }, select: { id: true } })
    if (!role) return []
    const users = await this.prismaService.user.findMany({
      where: { roleId: role.id, status: UserStatus.ACTIVE, deletedAt: { isSet: false } },
      select: { id: true }
    })
    return users.map((u) => u.id)
  }

  private buildDirectoryWhere(activeIds: string[], f: AssistantDirectoryFilter): Prisma.AssistantProfileWhereInput {
    const window =
      f.availableFrom && f.availableTo
        ? {
            availabilityStatus: AvailabilityStatus.AVAILABLE,
            AND: [
              { OR: [{ availabilityFrom: null }, { availabilityFrom: { lte: new Date(f.availableTo) } }] },
              { OR: [{ availabilityTo: null }, { availabilityTo: { gte: new Date(f.availableFrom) } }] }
            ]
          }
        : {}
    return {
      userId: { in: activeIds },
      ...(f.specialization ? { specializations: { has: f.specialization } } : {}),
      ...(f.level ? { experienceLevel: f.level } : {}),
      ...window
    }
  }

  async findAssistantsForDirectory(f: AssistantDirectoryFilter, page: { limit: number; offset: number }) {
    const activeIds = await this.findActiveAssistantUserIds()
    if (activeIds.length === 0) return []
    return await this.prismaService.assistantProfile.findMany({
      where: this.buildDirectoryWhere(activeIds, f),
      orderBy: [{ isRecommended: 'desc' }, { reputationScore: 'desc' }, { ratingCount: 'desc' }],
      skip: page.offset,
      take: page.limit,
      include: { user: { select: { displayName: true, avatar: true } } }
    })
  }

  async countAssistantsForDirectory(f: AssistantDirectoryFilter): Promise<number> {
    const activeIds = await this.findActiveAssistantUserIds()
    if (activeIds.length === 0) return 0
    return await this.prismaService.assistantProfile.count({ where: this.buildDirectoryWhere(activeIds, f) })
  }
}
