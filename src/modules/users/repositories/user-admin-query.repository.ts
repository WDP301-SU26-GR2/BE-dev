import { $Enums, Prisma } from '@prisma/client'
import { RoleName } from 'src/core/security/constants/role.constant'
import { PrismaService } from 'src/infrastructure/database/prisma.service'
import { CommitmentSummary } from '../users.constant'
import { ADMIN_USER_SELECT } from './user-admin-command.repository'
import { AdminUserFilter } from './users-repository.types'

const ACTIVE_SERIES_STATUSES: $Enums.SeriesStatus[] = [
  $Enums.SeriesStatus.IN_REVIEW,
  $Enums.SeriesStatus.READY_TO_PITCH,
  $Enums.SeriesStatus.PITCHED,
  $Enums.SeriesStatus.SERIALIZED,
  $Enums.SeriesStatus.HIATUS,
  $Enums.SeriesStatus.COMPLETING,
  $Enums.SeriesStatus.CANCELLING
]
const OPEN_TASK_STATUSES: $Enums.TaskStatus[] = [
  $Enums.TaskStatus.ASSIGNED,
  $Enums.TaskStatus.IN_PROGRESS,
  $Enums.TaskStatus.SUBMITTED,
  $Enums.TaskStatus.UNDER_REVIEW,
  $Enums.TaskStatus.REVISION_REQUESTED
]
const PENDING_DECISION_RESULTS: $Enums.BoardDecisionResult[] = [
  $Enums.BoardDecisionResult.PENDING,
  $Enums.BoardDecisionResult.PENDING_QUORUM
]

export class UserAdminQueryRepository {
  constructor(private readonly prismaService: PrismaService) {}

  private async buildWhere(filter: AdminUserFilter): Promise<Prisma.UserWhereInput> {
    let roleId: string | undefined
    if (filter.roleCode) {
      const role = await this.prismaService.role.findFirst({ where: { code: filter.roleCode }, select: { id: true } })
      roleId = role?.id ?? '000000000000000000000000'
    }
    return {
      ...(filter.excludeUserId ? { id: { not: filter.excludeUserId } } : {}),
      ...(roleId ? { roleId } : {}),
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.onlyDeleted
        ? { deletedAt: { isSet: true } }
        : filter.includeDeleted
          ? {}
          : { deletedAt: { isSet: false } }),
      ...(filter.search
        ? {
            OR: [
              { email: { contains: filter.search, mode: 'insensitive' } },
              { name: { contains: filter.search, mode: 'insensitive' } },
              { displayName: { contains: filter.search, mode: 'insensitive' } }
            ]
          }
        : {})
    }
  }

  async findUsersForAdmin(filter: AdminUserFilter, page: { limit: number; offset: number }) {
    return this.prismaService.user.findMany({
      where: await this.buildWhere(filter),
      orderBy: { createdAt: 'desc' },
      skip: page.offset,
      take: page.limit,
      select: ADMIN_USER_SELECT
    })
  }

  async countUsersForAdmin(filter: AdminUserFilter): Promise<number> {
    return this.prismaService.user.count({ where: await this.buildWhere(filter) })
  }

  findUserByIdForAdmin(id: string) {
    return this.prismaService.user.findUnique({ where: { id }, select: ADMIN_USER_SELECT })
  }

  findModerationTargetById(id: string) {
    return this.prismaService.user.findUnique({
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

  async countActiveCommitments(userId: string, roleCode: string): Promise<CommitmentSummary> {
    const empty = {
      activeSeries: 0,
      executedContracts: 0,
      openTasks: 0,
      activeAssignments: 0,
      pendingBoardDecisions: 0
    }
    if (roleCode === RoleName.MANGAKA) {
      const [activeSeries, executedContracts] = await Promise.all([
        this.prismaService.series.count({ where: { mangakaId: userId, status: { in: ACTIVE_SERIES_STATUSES } } }),
        this.prismaService.contract.count({
          where: { mangakaId: userId, status: $Enums.ContractStatus.FULLY_EXECUTED }
        })
      ])
      return { ...empty, activeSeries, executedContracts, total: activeSeries + executedContracts }
    }
    if (roleCode === RoleName.EDITOR) {
      const activeSeries = await this.prismaService.series.count({
        where: { editorId: userId, status: { in: ACTIVE_SERIES_STATUSES } }
      })
      return { ...empty, activeSeries, total: activeSeries }
    }
    if (roleCode === RoleName.ASSISTANT) {
      const [openTasks, activeAssignments] = await Promise.all([
        this.prismaService.task.count({ where: { assistantId: userId, status: { in: OPEN_TASK_STATUSES } } }),
        this.prismaService.studioAssignment.count({
          where: { assistantId: userId, status: $Enums.StudioAssignmentStatus.ACTIVE }
        })
      ])
      return { ...empty, openTasks, activeAssignments, total: openTasks + activeAssignments }
    }
    if (roleCode === RoleName.BOARD_MEMBER) {
      const pendingBoardDecisions = await this.prismaService.boardDecision.count({
        where: {
          result: { in: PENDING_DECISION_RESULTS },
          boardSession: { is: { allowedEditorIds: { has: userId } } }
        }
      })
      return { ...empty, pendingBoardDecisions, total: pendingBoardDecisions }
    }
    return { ...empty, total: 0 }
  }
}
