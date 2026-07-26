import { Injectable } from '@nestjs/common'
import { AssistantProfileBodyType, MangakaProfileBodyType, StaffProfileBodyType } from '../schemas/users-schemas'
import { AssistantProfileService } from './assistant-profile.service'
import { MangakaProfileService } from './mangaka-profile.service'
import { StaffProfileService } from './staff-profile.service'

@Injectable()
export class UserProfileFacade {
  constructor(
    private readonly mangakaService: MangakaProfileService,
    private readonly assistantService: AssistantProfileService,
    private readonly staffService: StaffProfileService
  ) {}

  upsertMangaka(userId: string, body: MangakaProfileBodyType) {
    return this.mangakaService.upsertMyProfile(userId, body)
  }
  getMangaka(userId: string) {
    return this.mangakaService.getByUserId(userId)
  }
  upsertAssistant(userId: string, body: AssistantProfileBodyType) {
    return this.assistantService.upsertMyProfile(userId, body)
  }
  getAssistant(userId: string) {
    return this.assistantService.getByUserId(userId)
  }
  upsertStaff(userId: string, body: StaffProfileBodyType) {
    return this.staffService.upsertMyProfile(userId, body)
  }
  getStaff(userId: string) {
    return this.staffService.getByUserId(userId)
  }
}
