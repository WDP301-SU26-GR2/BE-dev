import { Injectable } from '@nestjs/common'
import {
  AdminCreateUserBodyType,
  AdminUpdateUserStatusBodyType,
  AssistantProfileBodyType,
  ListAssistantsQueryType,
  ListMangakasQueryType,
  ListUsersQueryType,
  MangakaProfileBodyType,
  StaffProfileBodyType,
  UpdateMeBodyType
} from './schemas/users-schemas'
import { MeService } from './services/me.service'
import { UserAdminFacade } from './services/user-admin.facade'
import { UserDirectoryFacade } from './services/user-directory.facade'
import { UserProfileFacade } from './services/user-profile.facade'

@Injectable()
export class UsersService {
  constructor(
    private readonly meService: MeService,
    private readonly adminFacade: UserAdminFacade,
    private readonly profileFacade: UserProfileFacade,
    private readonly directoryFacade: UserDirectoryFacade
  ) {}

  getMe(userId: string) {
    return this.meService.getMe(userId)
  }
  updateMe(userId: string, body: UpdateMeBodyType) {
    return this.meService.updateMe(userId, body)
  }
  createUserByAdmin(body: AdminCreateUserBodyType) {
    return this.adminFacade.createUser(body)
  }
  listUsers(callerId: string, query: ListUsersQueryType) {
    return this.adminFacade.listUsers(callerId, query)
  }
  getUserById(id: string) {
    return this.adminFacade.getUserById(id)
  }
  updateUserStatus(id: string, body: AdminUpdateUserStatusBodyType, adminId: string) {
    return this.adminFacade.updateUserStatus(id, body, adminId)
  }
  deleteUser(id: string, adminId: string) {
    return this.adminFacade.deleteUser(id, adminId)
  }
  restoreUser(id: string, adminId: string) {
    return this.adminFacade.restoreUser(id, adminId)
  }
  resetUserPassword(id: string, adminId: string) {
    return this.adminFacade.resetUserPassword(id, adminId)
  }
  getAdminStats() {
    return this.adminFacade.getStats()
  }
  upsertMangakaProfile(userId: string, body: MangakaProfileBodyType) {
    return this.profileFacade.upsertMangaka(userId, body)
  }
  getMyMangakaProfile(userId: string) {
    return this.profileFacade.getMangaka(userId)
  }
  getMangakaProfile(userId: string) {
    return this.profileFacade.getMangaka(userId)
  }
  upsertAssistantProfile(userId: string, body: AssistantProfileBodyType) {
    return this.profileFacade.upsertAssistant(userId, body)
  }
  getMyAssistantProfile(userId: string) {
    return this.profileFacade.getAssistant(userId)
  }
  getAssistantProfile(userId: string) {
    return this.profileFacade.getAssistant(userId)
  }
  listAssistants(query: ListAssistantsQueryType) {
    return this.directoryFacade.listAssistants(query)
  }
  listMangakas(query: ListMangakasQueryType) {
    return this.directoryFacade.listMangakas(query)
  }
  upsertStaffProfile(userId: string, body: StaffProfileBodyType) {
    return this.profileFacade.upsertStaff(userId, body)
  }
  getMyStaffProfile(userId: string) {
    return this.profileFacade.getStaff(userId)
  }
  getStaffProfile(userId: string) {
    return this.profileFacade.getStaff(userId)
  }
}
