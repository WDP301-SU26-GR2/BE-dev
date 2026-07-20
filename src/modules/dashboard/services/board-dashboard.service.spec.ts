import { $Enums } from '@prisma/client'
import { BoardDashboardService } from './board-dashboard.service'
import { asCacheService, makeCacheServiceMock } from 'src/infrastructure/redis/cache.service.mock'

describe('BoardDashboardService', () => {
  it('joins pending decisions and severe rankings with session phases and series titles', async () => {
    const dashboardRepository = {
      boardActiveSessions: jest.fn().mockResolvedValue([{ id: 'session-1', phase: $Enums.BoardSessionPhase.VOTING }]),
      boardUpcomingSessionCount: jest.fn().mockResolvedValue(2),
      severeRiskRankings: jest.fn().mockResolvedValue([{ seriesId: 'series-2', rankPosition: 9 }]),
      pendingDecisionsBySessions: jest.fn().mockResolvedValue([
        {
          id: 'decision-1',
          boardSessionId: 'session-1',
          decisionType: $Enums.DecisionType.SERIALIZATION,
          targetSeriesId: 'series-1',
          result: $Enums.BoardDecisionResult.PENDING
        },
        {
          id: 'legacy-incomplete',
          boardSessionId: 'session-1',
          decisionType: null,
          targetSeriesId: 'series-2',
          result: $Enums.BoardDecisionResult.PENDING
        }
      ]),
      seriesTitles: jest.fn().mockResolvedValue([
        { id: 'series-1', title: 'Candidate' },
        { id: 'series-2', title: 'Severe' }
      ])
    }
    const notificationService = { countUnread: jest.fn().mockResolvedValue(1) }
    const service = new BoardDashboardService(
      dashboardRepository as never,
      notificationService as never,
      asCacheService(makeCacheServiceMock())
    )

    const result = await service.build('board-1')

    expect(result.pendingDecisions[0]).toEqual({
      decisionId: 'decision-1',
      boardSessionId: 'session-1',
      decisionType: $Enums.DecisionType.SERIALIZATION,
      targetSeries: { id: 'series-1', title: 'Candidate' },
      phase: $Enums.BoardSessionPhase.VOTING,
      result: $Enums.BoardDecisionResult.PENDING
    })
    expect(result.pendingDecisions).toHaveLength(1)
    expect(result.upcomingSessions).toBe(2)
    expect(result.atRiskSevere).toEqual([{ seriesId: 'series-2', title: 'Severe', rankPosition: 9 }])
    expect(result.unreadNotifications).toBe(1)
  })
})
