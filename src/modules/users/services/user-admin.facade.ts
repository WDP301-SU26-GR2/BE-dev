import { Injectable } from '@nestjs/common'
import { AdminCreateUserBodyType, AdminUpdateUserStatusBodyType, ListUsersQueryType } from '../schemas/users-schemas'
import { AdminModerationService } from './admin-moderation.service'
import { AdminStatsService } from './admin-stats.service'
import { AdminUserQueryService } from './admin-user-query.service'
import { AdminUserService } from './admin-user.service'

@Injectable()
export class UserAdminFacade {
  constructor(
    private readonly commandService: AdminUserService,
    private readonly queryService: AdminUserQueryService,
    private readonly moderationService: AdminModerationService,
    private readonly statsService: AdminStatsService
  ) {}

  createUser(body: AdminCreateUserBodyType) {
    return this.commandService.createUser(body)
  }
  listUsers(callerId: string, query: ListUsersQueryType) {
    return this.queryService.list(callerId, query)
  }
  getUserById(id: string) {
    return this.queryService.getById(id)
  }
  updateUserStatus(id: string, body: AdminUpdateUserStatusBodyType, adminId: string) {
    return this.moderationService.updateStatus(id, body, adminId)
  }
  deleteUser(id: string, adminId: string) {
    return this.moderationService.deleteUser(id, adminId)
  }
  restoreUser(id: string, adminId: string) {
    return this.moderationService.restoreUser(id, adminId)
  }
  resetUserPassword(id: string, adminId: string) {
    return this.moderationService.resetPassword(id, adminId)
  }
  getStats() {
    return this.statsService.getStats()
  }
}
