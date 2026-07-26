import { InternalRankingQueryService } from './internal-ranking-query.service'

const PERIOD_ID = '507f1f77bcf86cd799439011'
const SERIES_ID = '507f1f77bcf86cd799439012'
const USER_ID = '507f1f77bcf86cd799439013'

function makeDeps() {
  const repo = {
    findSurveyPeriodById: jest.fn(),
    getRankingRecordsByPeriod: jest.fn().mockResolvedValue([]),
    findSeriesOwnershipByIds: jest.fn().mockResolvedValue([]),
    getRankingRecordsBySeries: jest.fn().mockResolvedValue([])
  }
  const cache = {
    getOrSet: jest.fn(async (_namespace: string, _key: string, _ttl: number, factory: () => Promise<unknown>) =>
      factory()
    )
  }
  return { repo, cache }
}

function make(deps: ReturnType<typeof makeDeps>) {
  return new InternalRankingQueryService(deps.repo as never, deps.cache as never)
}

const ranking = (overrides: Record<string, unknown> = {}) => ({
  seriesId: SERIES_ID,
  surveyPeriodId: PERIOD_ID,
  rankPosition: 1,
  voteCount: 20,
  normalizedScore: 0.5,
  previousRank: 2,
  rankChange: 1,
  isAtRisk: false,
  riskLevel: 'NONE',
  consecutiveAtRiskCount: 0,
  isReliable: true,
  recordedAt: new Date('2026-07-10T00:00:00.000Z'),
  ...overrides
})

describe('InternalRankingQueryService period ranking', () => {
  it.each(['getRankingRecords', 'getBoardRanking'] as const)(
    '%s blocks malformed and missing periods',
    async (method) => {
      const malformed = makeDeps()
      await expect(make(malformed)[method]('bad-id')).rejects.toMatchObject({ status: 404 })
      expect(malformed.repo.findSurveyPeriodById).not.toHaveBeenCalled()

      const missing = makeDeps()
      missing.repo.findSurveyPeriodById.mockResolvedValue(null)
      await expect(make(missing)[method](PERIOD_ID)).rejects.toMatchObject({ status: 404 })
      expect(missing.repo.getRankingRecordsByPeriod).not.toHaveBeenCalled()
    }
  )

  it('maps nullable relation and historical fields to stable internal defaults', async () => {
    const deps = makeDeps()
    deps.repo.findSurveyPeriodById.mockResolvedValue({ id: PERIOD_ID })
    deps.repo.getRankingRecordsByPeriod.mockResolvedValue([
      ranking({
        surveyPeriod: null,
        rankPosition: null,
        riskLevel: null,
        consecutiveAtRiskCount: null
      }),
      ranking({
        seriesId: 's2',
        surveyPeriod: {
          magazine: 'Jump',
          publicationType: 'WEEKLY',
          issueNumber: 5
        }
      })
    ])

    await expect(make(deps).getRankingRecords(PERIOD_ID)).resolves.toEqual({
      items: [
        expect.objectContaining({
          seriesId: SERIES_ID,
          magazine: null,
          publicationType: null,
          issueNumber: null,
          rankPosition: undefined,
          riskLevel: 'NONE',
          consecutiveAtRiskCount: 0
        }),
        expect.objectContaining({
          seriesId: 's2',
          magazine: 'Jump',
          publicationType: 'WEEKLY',
          issueNumber: 5
        })
      ]
    })
  })

  it('sorts board ranking by rank and injects the verified period scope', async () => {
    const deps = makeDeps()
    deps.repo.findSurveyPeriodById.mockResolvedValue({
      id: PERIOD_ID,
      magazine: 'Jump',
      publicationType: 'WEEKLY',
      issueNumber: 5
    })
    deps.repo.getRankingRecordsByPeriod.mockResolvedValue([
      ranking({ seriesId: 's2', rankPosition: null }),
      ranking({ seriesId: 's3', rankPosition: 2 }),
      ranking({ seriesId: 's1', rankPosition: 1 })
    ])

    const result = await make(deps).getBoardRanking(PERIOD_ID)

    expect(result.items.map((item) => item.seriesId)).toEqual(['s2', 's1', 's3'])
    expect(result.items[1]).toMatchObject({
      magazine: 'Jump',
      publicationType: 'WEEKLY',
      issueNumber: 5
    })
  })
})

describe('InternalRankingQueryService owner-scoped trend', () => {
  it('rejects malformed, missing and unauthorized series', async () => {
    await expect(
      make(makeDeps()).getSeriesTrend('bad-id', 6, { userId: USER_ID, roleName: 'BOARD_MEMBER' })
    ).rejects.toMatchObject({ status: 404 })

    const missing = makeDeps()
    await expect(
      make(missing).getSeriesTrend(SERIES_ID, 6, { userId: USER_ID, roleName: 'BOARD_MEMBER' })
    ).rejects.toMatchObject({ status: 404 })

    const denied = makeDeps()
    denied.repo.findSeriesOwnershipByIds.mockResolvedValue([
      { id: SERIES_ID, mangakaId: 'other', editorId: 'other-editor' }
    ])
    await expect(
      make(denied).getSeriesTrend(SERIES_ID, 6, { userId: USER_ID, roleName: 'MANGAKA' })
    ).rejects.toMatchObject({ status: 403 })
    expect(denied.repo.getRankingRecordsBySeries).not.toHaveBeenCalled()
  })

  it.each([
    ['BOARD_MEMBER', 'outsider'],
    ['SUPER_ADMIN', 'outsider'],
    ['MANGAKA', USER_ID],
    ['EDITOR', USER_ID]
  ])('allows %s only through its intended authorization branch', async (roleName, matchingId) => {
    const deps = makeDeps()
    deps.repo.findSeriesOwnershipByIds.mockResolvedValue([
      {
        id: SERIES_ID,
        mangakaId: roleName === 'MANGAKA' ? matchingId : 'mangaka',
        editorId: roleName === 'EDITOR' ? matchingId : 'editor'
      }
    ])

    await expect(make(deps).getSeriesTrend(SERIES_ID, 6, { userId: matchingId, roleName })).resolves.toEqual({
      items: []
    })
    expect(deps.repo.getRankingRecordsBySeries).toHaveBeenCalledWith(SERIES_ID, 6)
  })

  it('discloses only reflected, fully-scoped history while retaining legacy rows without period relation', async () => {
    const deps = makeDeps()
    deps.repo.findSeriesOwnershipByIds.mockResolvedValue([{ id: SERIES_ID, mangakaId: USER_ID, editorId: null }])
    deps.repo.getRankingRecordsBySeries.mockResolvedValue([
      ranking({ surveyPeriod: null }),
      ranking({
        seriesId: 'reflected',
        surveyPeriod: { status: 'REFLECTED', magazine: 'Jump', publicationType: 'WEEKLY', issueNumber: 1 }
      }),
      ranking({
        seriesId: 'open',
        surveyPeriod: { status: 'OPEN', magazine: 'Jump', publicationType: 'WEEKLY', issueNumber: 2 }
      }),
      ranking({
        seriesId: 'unscoped-magazine',
        surveyPeriod: { status: 'REFLECTED', magazine: null, publicationType: 'WEEKLY', issueNumber: 3 }
      }),
      ranking({
        seriesId: 'unscoped-type',
        surveyPeriod: { status: 'REFLECTED', magazine: 'Jump', publicationType: null, issueNumber: 4 }
      })
    ])

    const result = await make(deps).getSeriesTrend(SERIES_ID, 5, { userId: USER_ID, roleName: 'MANGAKA' })

    expect(result.items.map((item) => item.seriesId)).toEqual([SERIES_ID, 'reflected'])
  })
})
