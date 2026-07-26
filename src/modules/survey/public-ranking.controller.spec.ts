import { PublicRankingController } from './public-ranking.controller'

describe('PublicRankingController', () => {
  it('delegates every public ranking route to the Survey facade', async () => {
    const surveyService = {
      getLatestVoteResults: jest.fn().mockResolvedValue({ period: null, results: [] }),
      getReflectedPeriods: jest.fn().mockResolvedValue({ items: [] }),
      getVoteResults: jest.fn().mockResolvedValue({ surveyPeriodId: 'period', results: [] }),
      getRankingAggregate: jest.fn().mockResolvedValue({ items: [] })
    }
    const controller = new PublicRankingController(surveyService as never)

    await controller.getLatestVoteResults({ magazine: 'Jump', publicationType: 'WEEKLY' })
    await controller.getVotePeriods({ magazine: 'Jump', publicationType: 'WEEKLY', limit: 6 })
    await controller.getVoteResults({ surveyPeriodId: 'period' })
    const aggregateQuery = {
      magazine: 'Jump',
      publicationType: 'WEEKLY',
      level: 'YEAR',
      year: 2026
    } as const
    await controller.getRankingAggregate(aggregateQuery)

    expect(surveyService.getLatestVoteResults).toHaveBeenCalledWith('Jump', 'WEEKLY')
    expect(surveyService.getReflectedPeriods).toHaveBeenCalledWith('Jump', 'WEEKLY', 6)
    expect(surveyService.getVoteResults).toHaveBeenCalledWith('period')
    expect(surveyService.getRankingAggregate).toHaveBeenCalledWith(aggregateQuery)
  })
})
