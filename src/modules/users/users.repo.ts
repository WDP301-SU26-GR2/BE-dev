import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from 'src/infrastructure/database/prisma.service'
import { AssistantProfileBodyType, MangakaProfileBodyType, StaffProfileBodyType } from './schemas/users-schemas'
import { UserAdminRepository } from './repositories/user-admin.repository'
import { UserDirectoryRepository } from './repositories/user-directory.repository'
import { UserProfileRepository } from './repositories/user-profile.repository'
import { AssistantDirectoryFilter, MangakaDirectoryFilter } from './repositories/users-repository.types'

export type {
  AdminUserFilter,
  AssistantDirectoryFilter,
  MangakaDirectoryFilter,
  UserRoleCountRow
} from './repositories/users-repository.types'

/**
 * Stable module-private facade. Admin, directory and profile persistence are
 * split by use case while existing services retain the UsersRepository API.
 */
@Injectable()
export class UsersRepository extends UserAdminRepository {
  private readonly directory: UserDirectoryRepository
  private readonly profile: UserProfileRepository

  constructor(prismaService: PrismaService) {
    super(prismaService)
    this.directory = new UserDirectoryRepository(prismaService)
    this.profile = new UserProfileRepository(prismaService)
  }

  upsertMangakaProfile(userId: string, data: MangakaProfileBodyType) {
    return this.profile.upsertMangakaProfile(userId, data)
  }

  findMangakaProfileByUserId(userId: string) {
    return this.profile.findMangakaProfileByUserId(userId)
  }

  findUserBasicsWithRole(userId: string) {
    return this.profile.findUserBasicsWithRole(userId)
  }

  findMeById(userId: string) {
    return this.profile.findMeById(userId)
  }

  updateMe(userId: string, data: Prisma.UserUpdateInput) {
    return this.profile.updateMe(userId, data)
  }

  upsertAssistantProfile(userId: string, data: AssistantProfileBodyType) {
    return this.profile.upsertAssistantProfile(userId, data)
  }

  findAssistantProfileByUserId(userId: string) {
    return this.profile.findAssistantProfileByUserId(userId)
  }

  upsertStaffProfile(userId: string, data: StaffProfileBodyType) {
    return this.profile.upsertStaffProfile(userId, data)
  }

  findStaffProfileByUserId(userId: string) {
    return this.profile.findStaffProfileByUserId(userId)
  }

  updateMangakaReputation(
    userId: string,
    data: { ratingAvg: number; ratingCount: number; reputationScore: number; isRecommended: boolean }
  ): Promise<void> {
    return this.profile.updateMangakaReputation(userId, data)
  }

  updateAssistantReputation(
    userId: string,
    data: { ratingAvg: number; ratingCount: number; reputationScore: number; isRecommended: boolean }
  ): Promise<void> {
    return this.profile.updateAssistantReputation(userId, data)
  }

  findAssistantsForDirectory(filter: AssistantDirectoryFilter, page: { limit: number; offset: number }) {
    return this.directory.findAssistantsForDirectory(filter, page)
  }

  countAssistantsForDirectory(filter: AssistantDirectoryFilter): Promise<number> {
    return this.directory.countAssistantsForDirectory(filter)
  }

  findMangakasForDirectory(filter: MangakaDirectoryFilter, page: { limit: number; offset: number }) {
    return this.directory.findMangakasForDirectory(filter, page)
  }

  countMangakasForDirectory(filter: MangakaDirectoryFilter): Promise<number> {
    return this.directory.countMangakasForDirectory(filter)
  }
}
