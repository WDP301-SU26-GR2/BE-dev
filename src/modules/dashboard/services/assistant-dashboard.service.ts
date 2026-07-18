import { Injectable } from '@nestjs/common'
import { $Enums } from '@prisma/client'
import { NotificationService } from 'src/modules/notification/notification.service'
import { DashboardRepository } from '../dashboard.repo'

@Injectable()
export class AssistantDashboardService {
  constructor(
    private readonly dashboardRepository: DashboardRepository,
    private readonly notificationService: NotificationService
  ) {}

  async build(userId: string) {
    const now = new Date()
    const [rows, activeAssignments, reputation, unreadNotifications] = await Promise.all([
      this.dashboardRepository.assistantTaskCounts(userId),
      this.dashboardRepository.assistantActiveAssignmentCount(userId, now),
      this.dashboardRepository.assistantReputation(userId),
      this.notificationService.countUnread(userId)
    ])
    const byStatus = Object.fromEntries(Object.values($Enums.TaskStatus).map((status) => [status, 0])) as Record<
      $Enums.TaskStatus,
      number
    >
    for (const row of rows) byStatus[row.status] = row._count._all
    const openTotal = byStatus.ASSIGNED + byStatus.IN_PROGRESS + byStatus.REVISION_REQUESTED

    return {
      tasks: { byStatus, openTotal },
      activeAssignments,
      reputation: {
        ratingAvg: reputation?.ratingAvg ?? 0,
        ratingCount: reputation?.ratingCount ?? 0,
        reputationScore: reputation?.reputationScore ?? 0,
        isRecommended: reputation?.isRecommended ?? false
      },
      unreadNotifications
    }
  }
}
