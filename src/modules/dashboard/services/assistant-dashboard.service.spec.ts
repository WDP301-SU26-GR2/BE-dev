import { $Enums } from '@prisma/client'
import { AssistantDashboardService } from './assistant-dashboard.service'

describe('AssistantDashboardService', () => {
  it('zero-fills workload, computes open total and defaults a missing reputation profile', async () => {
    const dashboardRepository = {
      assistantTaskCounts: jest.fn().mockResolvedValue([{ status: $Enums.TaskStatus.ASSIGNED, _count: { _all: 2 } }]),
      assistantActiveAssignmentCount: jest.fn().mockResolvedValue(1),
      assistantReputation: jest.fn().mockResolvedValue(null)
    }
    const notificationService = { countUnread: jest.fn().mockResolvedValue(3) }
    const service = new AssistantDashboardService(dashboardRepository as never, notificationService as never)

    const result = await service.build('assistant-1')

    expect(result.tasks.byStatus.ASSIGNED).toBe(2)
    expect(result.tasks.openTotal).toBe(2)
    expect(Object.keys(result.tasks.byStatus)).toHaveLength(Object.values($Enums.TaskStatus).length)
    expect(result.reputation).toEqual({ ratingAvg: 0, ratingCount: 0, reputationScore: 0, isRecommended: false })
    expect(result.activeAssignments).toBe(1)
    expect(result.unreadNotifications).toBe(3)
    expect(dashboardRepository.assistantActiveAssignmentCount.mock.calls[0][1]).toBeInstanceOf(Date)
  })
})
