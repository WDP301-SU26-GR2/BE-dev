import { PublicVoteQueryService } from './public-vote-query.service'
import { PublicVoteContextQueryService } from './public-vote-context-query.service'
import { PublicRankingQueryService } from './public-ranking-query.service'

const PERIOD_ID = '507f1f77bcf86cd799439011'
const OTHER_PERIOD_ID = '507f1f77bcf86cd799439012'

function makeDeps() {
  const repo = {
    findLatestOpenSurveyPeriod: jest.fn(),
    findManySerializedSeriesPublic: jest.fn().mockResolvedValue([]),
    findSurveyPeriodById: jest.fn(),
    findPublicSeriesByIds: jest.fn().mockResolvedValue([]),
    findLatestReflectedPeriod: jest.fn(),
    findLatestReflectedScopedPeriod: jest.fn(),
    findReflectedPeriods: jest.fn().mockResolvedValue([]),
    findReflectedScopedPeriods: jest.fn().mockResolvedValue([]),
    getRankingRecordsByPeriod: jest.fn().mockResolvedValue([]),
    findSeriesTitlesByIds: jest.fn().mockResolvedValue([])
  }
  const config = { get: jest.fn().mockResolvedValue({ maxSeriesPerVote: 3 }) }
  const cache = {
    getOrSet: jest.fn(async (_namespace: string, _key: string, _ttl: number, factory: () => Promise<unknown>) =>
      factory()
    )
  }
  return { repo, config, cache }
}

function make(deps: ReturnType<typeof makeDeps>) {
  const context = new PublicVoteContextQueryService(deps.repo as never, deps.config as never, deps.cache as never)
  const ranking = new PublicRankingQueryService(deps.repo as never, deps.cache as never)
  return new PublicVoteQueryService(context, ranking)
}

describe('PublicVoteQueryService vote context eligibility and privacy projection', () => {
  it('returns a safe empty legacy context when no period is open', async () => {
    const deps = makeDeps()
    deps.repo.findLatestOpenSurveyPeriod.mockResolvedValue(null)

    await expect(make(deps).getVoteContext()).resolves.toEqual({
      period: null,
      series: [],
      maxSeriesPerVote: 3
    })
    expect(deps.repo.findManySerializedSeriesPublic).not.toHaveBeenCalled()
  })

  it('supports a legacy publication tab while normalizing nullable public fields', async () => {
    const deps = makeDeps()
    deps.repo.findLatestOpenSurveyPeriod.mockResolvedValue({
      id: PERIOD_ID,
      issueNumber: null,
      reflectedIssueNumber: undefined,
      startDate: null,
      endDate: null
    })
    deps.repo.findManySerializedSeriesPublic.mockResolvedValue([
      {
        id: 's1',
        title: 'Series',
        coverImage: undefined,
        demographic: undefined,
        publicationType: 'WEEKLY'
      }
    ])

    const result = await make(deps).getVoteContext('WEEKLY')

    expect(deps.repo.findManySerializedSeriesPublic).toHaveBeenCalledWith('WEEKLY')
    expect(result).toMatchObject({
      period: { issueNumber: null, reflectedIssueNumber: null, startDate: null, endDate: null },
      series: [{ coverImage: null, demographic: null, publicationType: 'WEEKLY' }]
    })
  })

  it('rejects malformed, missing, non-open and incomplete scoped periods', async () => {
    const serviceCases = [
      null,
      {
        id: PERIOD_ID,
        status: 'DRAFT',
        magazine: 'Jump',
        publicationType: 'WEEKLY',
        issueNumber: 1,
        eligibleSeriesIds: ['s1']
      },
      {
        id: PERIOD_ID,
        status: 'OPEN',
        magazine: '',
        publicationType: 'WEEKLY',
        issueNumber: 1,
        eligibleSeriesIds: ['s1']
      },
      {
        id: PERIOD_ID,
        status: 'OPEN',
        magazine: 'Jump',
        publicationType: null,
        issueNumber: 1,
        eligibleSeriesIds: ['s1']
      },
      {
        id: PERIOD_ID,
        status: 'OPEN',
        magazine: 'Jump',
        publicationType: 'WEEKLY',
        issueNumber: 0,
        eligibleSeriesIds: ['s1']
      },
      {
        id: PERIOD_ID,
        status: 'OPEN',
        magazine: 'Jump',
        publicationType: 'WEEKLY',
        issueNumber: 1,
        eligibleSeriesIds: []
      }
    ]

    await expect(make(makeDeps()).getVoteContext('bad-id')).rejects.toMatchObject({ status: 404 })
    for (const period of serviceCases) {
      const deps = makeDeps()
      deps.repo.findSurveyPeriodById.mockResolvedValue(period)
      await expect(make(deps).getVoteContext(PERIOD_ID)).rejects.toMatchObject({
        status: period === null ? 404 : 409
      })
    }
  })

  it('returns only the period eligibility snapshot for a valid scoped context', async () => {
    const deps = makeDeps()
    deps.repo.findSurveyPeriodById.mockResolvedValue({
      id: PERIOD_ID,
      status: 'OPEN',
      magazine: 'Jump',
      publicationType: 'WEEKLY',
      issueNumber: 11,
      reflectedIssueNumber: null,
      eligibleSeriesIds: ['s1'],
      startDate: new Date('2026-07-01T00:00:00.000Z'),
      endDate: new Date('2026-07-07T00:00:00.000Z')
    })
    deps.repo.findPublicSeriesByIds.mockResolvedValue([
      { id: 's1', title: 'Series', coverImage: null, genres: ['Action'], demographic: null }
    ])

    const result = await make(deps).getVoteContext(PERIOD_ID)

    expect(deps.repo.findPublicSeriesByIds).toHaveBeenCalledWith(['s1'])
    expect(result).toMatchObject({
      period: {
        magazine: 'Jump',
        publicationType: 'WEEKLY',
        issueNumber: 11,
        startDate: '2026-07-01T00:00:00.000Z',
        endDate: '2026-07-07T00:00:00.000Z'
      },
      series: [{ id: 's1', publicationType: 'WEEKLY', coverImage: null, demographic: null }]
    })
  })
})

describe('PublicVoteQueryService reflected ranking disclosure', () => {
  it('returns no latest result before any period is reflected', async () => {
    const deps = makeDeps()
    deps.repo.findLatestReflectedPeriod.mockResolvedValue(null)

    await expect(make(deps).getLatestVoteResults()).resolves.toEqual({ period: null, results: [] })
  })

  it('discovers legacy and scoped reflected periods with canonical cache scopes', async () => {
    const legacy = makeDeps()
    legacy.repo.findLatestReflectedPeriod.mockResolvedValue({
      id: PERIOD_ID,
      issueNumber: null,
      reflectedIssueNumber: undefined,
      startDate: null,
      endDate: null
    })
    legacy.repo.findSurveyPeriodById.mockResolvedValue({
      id: PERIOD_ID,
      status: 'REFLECTED',
      issueNumber: null
    })
    await expect(make(legacy).getLatestVoteResults('MONTHLY')).resolves.toMatchObject({
      period: { id: PERIOD_ID, issueNumber: null, reflectedIssueNumber: null },
      results: []
    })

    const scoped = makeDeps()
    scoped.repo.findLatestReflectedScopedPeriod.mockResolvedValue({
      id: OTHER_PERIOD_ID,
      issueNumber: 3,
      reflectedIssueNumber: 4,
      startDate: new Date('2026-07-01T00:00:00.000Z'),
      endDate: new Date('2026-07-31T00:00:00.000Z')
    })
    scoped.repo.findSurveyPeriodById.mockResolvedValue({
      id: OTHER_PERIOD_ID,
      status: 'REFLECTED',
      issueNumber: 3
    })

    await make(scoped).getLatestVoteResults('  Monthly Jump ', 'MONTHLY')
    expect(scoped.repo.findLatestReflectedScopedPeriod).toHaveBeenCalledWith('Monthly Jump', 'MONTHLY')
    expect(scoped.cache.getOrSet).toHaveBeenCalledWith(
      'ranking',
      'latest-period:Monthly Jump:MONTHLY',
      expect.any(Number),
      expect.any(Function)
    )
  })

  it('returns no scoped result when the requested magazine has not finalized a period', async () => {
    const deps = makeDeps()
    deps.repo.findLatestReflectedScopedPeriod.mockResolvedValue(null)

    await expect(make(deps).getLatestVoteResults('Jump', 'WEEKLY')).resolves.toEqual({
      period: null,
      results: []
    })
  })

  it('maps both legacy and scoped reflected period history with nullable dates', async () => {
    const deps = makeDeps()
    deps.repo.findReflectedPeriods.mockResolvedValue([
      { id: PERIOD_ID, issueNumber: null, reflectedIssueNumber: null, startDate: null, endDate: null }
    ])
    deps.repo.findReflectedScopedPeriods.mockResolvedValue([
      {
        id: OTHER_PERIOD_ID,
        issueNumber: 2,
        reflectedIssueNumber: 3,
        startDate: new Date('2026-07-01T00:00:00.000Z'),
        endDate: new Date('2026-07-31T00:00:00.000Z')
      }
    ])

    await expect(make(deps).getReflectedPeriods(5)).resolves.toEqual({
      items: [{ id: PERIOD_ID, issueNumber: null, reflectedIssueNumber: null, startDate: null, endDate: null }]
    })
    await expect(make(deps).getReflectedPeriods('  Jump ', 'MONTHLY', 6)).resolves.toMatchObject({
      items: [
        {
          id: OTHER_PERIOD_ID,
          issueNumber: 2,
          startDate: '2026-07-01T00:00:00.000Z',
          endDate: '2026-07-31T00:00:00.000Z'
        }
      ]
    })
    expect(deps.repo.findReflectedScopedPeriods).toHaveBeenCalledWith('Jump', 'MONTHLY', 6)
  })

  it('blocks malformed, missing and operational periods from public result disclosure', async () => {
    await expect(make(makeDeps()).getVoteResults('bad-id')).rejects.toMatchObject({ status: 404 })

    const missing = makeDeps()
    missing.repo.findSurveyPeriodById.mockResolvedValue(null)
    await expect(make(missing).getVoteResults(PERIOD_ID)).rejects.toMatchObject({ status: 404 })

    const open = makeDeps()
    open.repo.findSurveyPeriodById.mockResolvedValue({ id: PERIOD_ID, status: 'OPEN' })
    await expect(make(open).getVoteResults(PERIOD_ID)).rejects.toMatchObject({ status: 409 })
    expect(open.repo.getRankingRecordsByPeriod).not.toHaveBeenCalled()
  })

  it('maps missing titles safely and filters only when a legacy publication tab is requested', async () => {
    const deps = makeDeps()
    deps.repo.findSurveyPeriodById.mockResolvedValue({
      id: PERIOD_ID,
      status: 'REFLECTED',
      issueNumber: null
    })
    deps.repo.getRankingRecordsByPeriod.mockResolvedValue([
      { seriesId: 's1', rankPosition: undefined, voteCount: 10, rankChange: undefined },
      { seriesId: 's2', rankPosition: 2, voteCount: 8, rankChange: -1 },
      { seriesId: 's3', rankPosition: 3, voteCount: 5, rankChange: 0 }
    ])
    deps.repo.findSeriesTitlesByIds.mockResolvedValue([
      { id: 's1', title: 'Weekly', publicationType: 'WEEKLY' },
      { id: 's2', title: 'Unknown type', publicationType: null }
    ])

    const all = await make(deps).getVoteResults(PERIOD_ID)
    const weekly = await make(deps).getVoteResults(PERIOD_ID, 'WEEKLY')

    expect(all.results).toEqual([
      {
        rankPosition: null,
        seriesId: 's1',
        seriesTitle: 'Weekly',
        publicationType: 'WEEKLY',
        voteCount: 10,
        rankChange: null
      },
      expect.objectContaining({ seriesId: 's2', publicationType: null }),
      expect.objectContaining({ seriesId: 's3', seriesTitle: null, publicationType: null })
    ])
    expect(weekly.results).toHaveLength(1)
    expect(weekly.results[0].seriesId).toBe('s1')
  })
})
