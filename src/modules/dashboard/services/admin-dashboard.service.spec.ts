import { AdminDashboardService } from './admin-dashboard.service'

describe('AdminDashboardService', () => {
  it('passes through system stats and adds the caller unread count', async () => {
    const systemStats = { users: { total: 10 } }
    const adminStatsService = { getStats: jest.fn().mockResolvedValue(systemStats) }
    const notificationService = { countUnread: jest.fn().mockResolvedValue(6) }
    const service = new AdminDashboardService(adminStatsService as never, notificationService as never)

    await expect(service.build('admin-1')).resolves.toEqual({ systemStats, unreadNotifications: 6 })
    expect(adminStatsService.getStats).toHaveBeenCalledTimes(1)
    expect(notificationService.countUnread).toHaveBeenCalledWith('admin-1')
  })
})
