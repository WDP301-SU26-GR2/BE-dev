import { $Enums } from '@prisma/client'
import { EditorDashboardService } from './editor-dashboard.service'

describe('EditorDashboardService', () => {
  it('aggregates editor counts and keeps only ranking risks and production warnings', async () => {
    const dashboardRepository = {
      editorReviewQueueCount: jest.fn().mockResolvedValue(2),
      editorSeriesByStatus: jest
        .fn()
        .mockResolvedValue([{ status: $Enums.SeriesStatus.SERIALIZED, _count: { _all: 2 } }]),
      editorSeriesForRanking: jest.fn().mockResolvedValue([
        { id: 's1', title: 'Safe' },
        { id: 's2', title: 'Risky' }
      ]),
      latestRankingForSeries: jest.fn().mockResolvedValue([
        { seriesId: 's1', riskLevel: $Enums.RiskLevel.NONE, rankPosition: 1 },
        { seriesId: 's2', riskLevel: $Enums.RiskLevel.SEVERE, rankPosition: 8 }
      ]),
      editorPendingContracts: jest
        .fn()
        .mockResolvedValue([{ id: 'c1', seriesId: 's2', status: $Enums.ContractStatus.MANGAKA_REVIEW }])
    }
    const overviewItems = [
      { chapterId: 'ch1', warningLevel: 'NONE' },
      { chapterId: 'ch2', warningLevel: 'RED' }
    ]
    const progressService = { overviewForEditor: jest.fn().mockResolvedValue({ items: overviewItems }) }
    const notificationService = { countUnread: jest.fn().mockResolvedValue(5) }
    const service = new EditorDashboardService(
      progressService as never,
      dashboardRepository as never,
      notificationService as never
    )

    const result = await service.build('editor-1')

    expect(result.reviewQueue).toBe(2)
    expect(result.mySeries.total).toBe(2)
    expect(result.atRisk).toEqual([
      { seriesId: 's2', title: 'Risky', riskLevel: $Enums.RiskLevel.SEVERE, rankPosition: 8 }
    ])
    expect(result.productionAlerts).toEqual([overviewItems[1]])
    expect(result.pendingContracts).toEqual([
      { contractId: 'c1', seriesId: 's2', status: $Enums.ContractStatus.MANGAKA_REVIEW }
    ])
  })
})
