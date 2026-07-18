import { MangakaDashboardService } from './mangaka-dashboard.service'

describe('MangakaDashboardService', () => {
  const studioItem = { chapterId: 'chapter-1' }
  const rankingItem = { seriesId: 'series-1' }

  it('aggregates and unwraps the four caller-scoped dashboard sources', async () => {
    const progressService = { overviewForMangaka: jest.fn().mockResolvedValue({ items: [studioItem] }) }
    const dashboardRepository = { rankingForMangaka: jest.fn().mockResolvedValue([rankingItem]) }
    const notificationService = { countUnread: jest.fn().mockResolvedValue(4) }
    const revisionService = { countOpenForRecipient: jest.fn().mockResolvedValue(2) }
    const service = new MangakaDashboardService(
      progressService as never,
      dashboardRepository as never,
      notificationService as never,
      revisionService as never
    )

    await expect(service.build('mangaka-1')).resolves.toEqual({
      studio: [studioItem],
      rankings: [rankingItem],
      unreadNotifications: 4,
      openRevisionRequests: 2
    })
    expect(progressService.overviewForMangaka).toHaveBeenCalledWith('mangaka-1')
    expect(dashboardRepository.rankingForMangaka).toHaveBeenCalledWith('mangaka-1')
    expect(notificationService.countUnread).toHaveBeenCalledWith('mangaka-1')
    expect(revisionService.countOpenForRecipient).toHaveBeenCalledWith('mangaka-1')
  })
})
