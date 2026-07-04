import { Injectable } from '@nestjs/common'
import { AdminModerationService } from './services/admin-moderation.service'
import { AdminStatsService } from './services/admin-stats.service'
import { AdminUserQueryService } from './services/admin-user-query.service'
import { AdminUserService } from './services/admin-user.service'
import { AssistantDirectoryService } from './services/assistant-directory.service'
import { AssistantProfileService } from './services/assistant-profile.service'
import { MangakaProfileService } from './services/mangaka-profile.service'
import {
  AdminCreateUserBodyType,
  AdminUpdateUserStatusBodyType,
  AssistantProfileBodyType,
  ListAssistantsQueryType,
  ListUsersQueryType,
  MangakaProfileBodyType
} from './schemas/users-schemas'

@Injectable()
export class UsersService {
  constructor(
    private readonly adminUserService: AdminUserService,
    private readonly adminUserQueryService: AdminUserQueryService,
    private readonly adminModerationService: AdminModerationService,
    private readonly adminStatsService: AdminStatsService,
    private readonly mangakaProfileService: MangakaProfileService,
    private readonly assistantProfileService: AssistantProfileService,
    private readonly assistantDirectoryService: AssistantDirectoryService
  ) {}

  createUserByAdmin(body: AdminCreateUserBodyType) {
    return this.adminUserService.createUser(body)
  }

  listUsers(callerId: string, query: ListUsersQueryType) {
    return this.adminUserQueryService.list(callerId, query)
  }

  getUserById(id: string) {
    return this.adminUserQueryService.getById(id)
  }

  updateUserStatus(id: string, body: AdminUpdateUserStatusBodyType) {
    return this.adminModerationService.updateStatus(id, body)
  }

  deleteUser(id: string) {
    return this.adminModerationService.deleteUser(id)
  }

  restoreUser(id: string) {
    return this.adminModerationService.restoreUser(id)
  }

  resetUserPassword(id: string) {
    return this.adminModerationService.resetPassword(id)
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
}
