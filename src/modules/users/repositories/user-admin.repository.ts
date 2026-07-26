import { PrismaService } from 'src/infrastructure/database/prisma.service'
import { CommitmentSummary } from '../users.constant'
import { UserAdminCommandRepository } from './user-admin-command.repository'
import { UserAdminQueryRepository } from './user-admin-query.repository'
import { UserAdminStatsRepository } from './user-admin-stats.repository'
import { AdminUserFilter, UserRoleCountRow } from './users-repository.types'

export class UserAdminRepository extends UserAdminCommandRepository {
  private readonly queries: UserAdminQueryRepository
  private readonly stats: UserAdminStatsRepository

  constructor(prismaService: PrismaService) {
    super(prismaService)
    this.queries = new UserAdminQueryRepository(prismaService)
    this.stats = new UserAdminStatsRepository(prismaService)
  }

  findUsersForAdmin(filter: AdminUserFilter, page: { limit: number; offset: number }) {
    return this.queries.findUsersForAdmin(filter, page)
  }

  countUsersForAdmin(filter: AdminUserFilter): Promise<number> {
    return this.queries.countUsersForAdmin(filter)
  }

  findUserByIdForAdmin(id: string) {
    return this.queries.findUserByIdForAdmin(id)
  }

  findModerationTargetById(id: string) {
    return this.queries.findModerationTargetById(id)
  }

  countActiveCommitments(userId: string, roleCode: string): Promise<CommitmentSummary> {
    return this.queries.countActiveCommitments(userId, roleCode)
  }

  groupUsersByStatus() {
    return this.stats.groupUsersByStatus()
  }

  groupUsersByRole(): Promise<UserRoleCountRow[]> {
    return this.stats.groupUsersByRole()
  }

  countDeletedUsers(): Promise<number> {
    return this.stats.countDeletedUsers()
  }

  groupSeriesByStatus() {
    return this.stats.groupSeriesByStatus()
  }

  countChapters(): Promise<{ total: number; published: number }> {
    return this.stats.countChapters()
  }

  groupTasksByStatus() {
    return this.stats.groupTasksByStatus()
  }
}
