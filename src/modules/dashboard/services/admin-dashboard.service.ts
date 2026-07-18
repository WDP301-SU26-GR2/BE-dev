import { Injectable } from '@nestjs/common'
import { NotificationService } from 'src/modules/notification/notification.service'
import { AdminStatsService } from 'src/modules/users/services/admin-stats.service'

@Injectable()
export class AdminDashboardService {
  constructor(
    private readonly adminStatsService: AdminStatsService,
    private readonly notificationService: NotificationService
  ) {}

  async build(userId: string) {
    const [systemStats, unreadNotifications] = await Promise.all([
      this.adminStatsService.getStats(),
      this.notificationService.countUnread(userId)
    ])
    return { systemStats, unreadNotifications }
  }
}
