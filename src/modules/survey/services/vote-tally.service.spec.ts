import { PublicationType } from '@prisma/client'
import { SurveyPeriodNotOpenException } from '../errors/survey.errors'
import { VoteTallyRepository, VoteTallyService } from './vote-tally.service'

describe('VoteTallyService', () => {
  const periodId = '0123456789abcdef01234567'
  let repository: jest.Mocked<VoteTallyRepository>
  let service: VoteTallyService

  beforeEach(() => {
    repository = {
      findSurveyPeriodById: jest.fn(),
      getReaderVotesByPeriod: jest.fn(),
      findPublicSeriesByIds: jest.fn()
    }
    service = new VoteTallyService(repository as never)
  })

  it('returns raw selected-series counts and ballot count for the frozen OPEN snapshot', async () => {
    repository.findSurveyPeriodById.mockResolvedValue({
      id: periodId,
      status: 'OPEN',
      magazine: 'Weekly Jump',
      publicationType: PublicationType.WEEKLY,
      issueNumber: 35,
      eligibleSeriesIds: ['a', 'b']
    })
    repository.getReaderVotesByPeriod.mockResolvedValue([
      { seriesIds: ['a', 'b'], votedAt: new Date('2026-07-24T00:00:00.000Z') },
      { seriesIds: ['a', 'outside'], votedAt: new Date('2026-07-24T00:00:01.000Z') }
    ])
    repository.findPublicSeriesByIds.mockResolvedValue([
      { id: 'a', title: 'Alpha', coverImage: 'alpha.webp' },
      { id: 'b', title: 'Beta', coverImage: null }
    ])

    await expect(service.getLiveTally(periodId)).resolves.toMatchObject({
      periodId,
      magazine: 'Weekly Jump',
      publicationType: PublicationType.WEEKLY,
      issueNumber: 35,
      totalVotes: 2,
      tally: [
        { seriesId: 'a', title: 'Alpha', coverImage: 'alpha.webp', count: 2 },
        { seriesId: 'b', title: 'Beta', coverImage: null, count: 1 }
      ]
    })
  })

  it('rejects legacy or non-OPEN periods instead of leaking an unscoped tally', async () => {
    repository.findSurveyPeriodById.mockResolvedValue({
      id: periodId,
      status: 'OPEN',
      magazine: null,
      publicationType: null,
      issueNumber: 35,
      eligibleSeriesIds: []
    })

    await expect(service.getLiveTally(periodId)).rejects.toBe(SurveyPeriodNotOpenException)
  })
})
