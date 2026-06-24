import { Injectable } from '@nestjs/common'
import { AdminUserService } from './services/admin-user.service'
import { AssistantProfileService } from './services/assistant-profile.service'
import { MangakaProfileService } from './services/mangaka-profile.service'
import { AdminCreateUserBodyType, AssistantProfileBodyType, MangakaProfileBodyType } from './schemas/users-schemas'

@Injectable()
export class UsersService {
  constructor(
    private readonly adminUserService: AdminUserService,
    private readonly mangakaProfileService: MangakaProfileService,
    private readonly assistantProfileService: AssistantProfileService
  ) {}

  createUserByAdmin(body: AdminCreateUserBodyType) {
    return this.adminUserService.createUser(body)
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
}
