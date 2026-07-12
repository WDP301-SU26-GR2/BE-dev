import { Injectable } from '@nestjs/common'
import { AdminModerationService } from './services/admin-moderation.service'
import { AdminStatsService } from './services/admin-stats.service'
import { AdminUserQueryService } from './services/admin-user-query.service'
import { AdminUserService } from './services/admin-user.service'
import { AssistantDirectoryService } from './services/assistant-directory.service'
import { AssistantProfileService } from './services/assistant-profile.service'
import { MangakaProfileService } from './services/mangaka-profile.service'
import { MeService } from './services/me.service'
import { StaffProfileService } from './services/staff-profile.service'
import {
  AdminCreateUserBodyType,
  AdminUpdateUserStatusBodyType,
  AssistantProfileBodyType,
  ListAssistantsQueryType,
  ListUsersQueryType,
  MangakaProfileBodyType,
  StaffProfileBodyType,
  UpdateMeBodyType
} from './schemas/users-schemas'

@Injectable()
export class UsersService {
  constructor(
    private readonly meService: MeService,
    private readonly adminUserService: AdminUserService,
    private readonly adminUserQueryService: AdminUserQueryService,
    private readonly adminModerationService: AdminModerationService,
    private readonly adminStatsService: AdminStatsService,
    private readonly mangakaProfileService: MangakaProfileService,
    private readonly assistantProfileService: AssistantProfileService,
    private readonly assistantDirectoryService: AssistantDirectoryService,
    private readonly staffProfileService: StaffProfileService
  ) {}

  getMe(userId: string) {
    return this.meService.getMe(userId)
  }

  updateMe(userId: string, body: UpdateMeBodyType) {
    return this.meService.updateMe(userId, body)
  }

  createUserByAdmin(body: AdminCreateUserBodyType) {
    return this.adminUserService.createUser(body)
  }

  listUsers(callerId: string, query: ListUsersQueryType) {
    return this.adminUserQueryService.list(callerId, query)
  }

  getUserById(id: string) {
    return this.adminUserQueryService.getById(id)
  }

  updateUserStatus(id: string, body: AdminUpdateUserStatusBodyType, adminId: string) {
    return this.adminModerationService.updateStatus(id, body, adminId)
  }

  deleteUser(id: string, adminId: string) {
    return this.adminModerationService.deleteUser(id, adminId)
  }

  restoreUser(id: string, adminId: string) {
    return this.adminModerationService.restoreUser(id, adminId)
  }

  resetUserPassword(id: string, adminId: string) {
    return this.adminModerationService.resetPassword(id, adminId)
  }

  getAdminStats() {
    return this.adminStatsService.getStats()
  }

  upsertMangakaProfile(userId: string, body: MangakaProfileBodyType) {
    return this.mangakaProfileService.upsertMyProfile(userId, body)
  }

  getMyMangakaProfile(userId: string) {
    return this.mangakaProfileService.getByUserId(userId)
  }

  getMangakaProfile(userId: string) {
    return this.mangakaProfileService.getByUserId(userId)
  }

  upsertAssistantProfile(userId: string, body: AssistantProfileBodyType) {
    return this.assistantProfileService.upsertMyProfile(userId, body)
  }

  getMyAssistantProfile(userId: string) {
    return this.assistantProfileService.getByUserId(userId)
  }

  getAssistantProfile(userId: string) {
    return this.assistantProfileService.getByUserId(userId)
  }

  listAssistants(query: ListAssistantsQueryType) {
    return this.assistantDirectoryService.list(query)
  }

  upsertStaffProfile(userId: string, body: StaffProfileBodyType) {
    return this.staffProfileService.upsertMyProfile(userId, body)
  }

  getMyStaffProfile(userId: string) {
    return this.staffProfileService.getByUserId(userId)
  }

  getStaffProfile(userId: string) {
    return this.staffProfileService.getByUserId(userId)
  }
}
