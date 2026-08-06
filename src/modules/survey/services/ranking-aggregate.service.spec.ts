import { PublicationType, RiskLevel } from '@prisma/client'
import { createHash } from 'crypto'
import { RankingAggregateQuerySchema } from '../schemas/survey-schemas'
import { RankingAggregateService } from './ranking-aggregate.service'

const period = (id: string) => ({ id })

function make() {
  const repository = {
    findReflectedScopedPeriodsInRange: jest.fn(),
    findRankingRecordsByPeriodIds: jest.fn(),
    findInternalRankingRecordsByPeriodIds: jest.fn(),
    findSeriesTitlesByIds: jest.fn()
  }
  const appConfigService = { get: jest.fn().mockResolvedValue({ rankingAggregateMinCoverageRatio: 0.5 }) }
  const cacheService = {
    getOrSet: jest.fn(async (_ns: string, _suffix: string, _ttl: number, loader: () => Promise<unknown>) => loader())
  }
  return {
    service: new RankingAggregateService(repository as never, appConfigService as never, cacheService as never),
    repository,
    cacheService
  }
}

describe('RankingAggregateService', () => {
  it('uses each participating issue as the denominator, not every reflected issue', async () => {
    const { service, repository } = make()
    const periods = Array.from({ length: 40 }, (_, index) => period(`period-${index + 1}`))
    repository.findReflectedScopedPeriodsInRange.mockResolvedValue(periods)
    repository.findRankingRecordsByPeriodIds.mockResolvedValue([
      ...periods.flatMap((item) => [
        { seriesId: 'a', surveyPeriodId: item.id, voteCount: 10, normalizedScore: 0.4 },
        { seriesId: 'b', surveyPeriodId: item.id, voteCount: 8, normalizedScore: 0.3 }
      ]),
      ...periods.slice(34).flatMap((item) => [
        { seriesId: 'c', surveyPeriodId: item.id, voteCount: 6, normalizedScore: 0.6 },
        { seriesId: 'd', surveyPeriodId: item.id, voteCount: 3, normalizedScore: 0.1 }
      ])
    ])
    repository.findSeriesTitlesByIds.mockResolvedValue([
      { id: 'a', title: 'A' },
      { id: 'b', title: 'B' },
      { id: 'c', title: 'C' },
      { id: 'd', title: 'D' }
    ])

    const result = await service.getAggregate({
      magazine: ' Weekly Jump ',
      publicationType: PublicationType.WEEKLY,
      level: 'YEAR',
      year: 2026
    })

    expect(result.reflectedIssueCount).toBe(40)
    expect(result.items.find((item) => item.seriesId === 'c')).toEqual(
      expect.objectContaining({ participatedIssueCount: 6, averageNormalizedScore: 0.6, isProvisional: true })
    )
    expect(result.items.find((item) => item.seriesId === 'a')).toEqual(
      expect.objectContaining({ participatedIssueCount: 40, isProvisional: false })
    )
    expect(result.items.find((item) => item.seriesId === 'a')?.averageNormalizedScore).toBeCloseTo(0.4)
    expect(repository.findReflectedScopedPeriodsInRange).toHaveBeenCalledWith(
      'Weekly Jump',
      PublicationType.WEEKLY,
      new Date('2026-01-01T00:00:00.000Z'),
      new Date('2027-01-01T00:00:00.000Z')
    )
  })

  it('uses UTC calendar-month boundaries and hashes the canonical magazine in its ranking cache key', async () => {
    const { service, repository, cacheService } = make()
    repository.findReflectedScopedPeriodsInRange.mockResolvedValue([period('period-1')])
    repository.findRankingRecordsByPeriodIds.mockResolvedValue([
      { seriesId: 'monthly', surveyPeriodId: 'period-1', voteCount: 4, normalizedScore: 1 }
    ])
    repository.findSeriesTitlesByIds.mockResolvedValue([{ id: 'monthly', title: 'Monthly' }])

    const result = await service.getAggregate({
      magazine: ' Monthly Jump ',
      publicationType: PublicationType.MONTHLY,
      level: 'MONTH',
      year: 2026,
      month: 7
    })

    expect(repository.findReflectedScopedPeriodsInRange).toHaveBeenCalledWith(
      'Monthly Jump',
      PublicationType.MONTHLY,
      new Date('2026-07-01T00:00:00.000Z'),
      new Date('2026-08-01T00:00:00.000Z')
    )
    expect(result.items[0]).toEqual(
      expect.objectContaining({ participatedIssueCount: 1, participationCoverage: 1, isProvisional: false })
    )
    const expectedHash = createHash('sha256').update('Monthly Jump').digest('hex')
    expect(cacheService.getOrSet).toHaveBeenCalledWith(
      'ranking',
      `aggregate:${expectedHash}:MONTHLY:MONTH:2026:7`,
      3600,
      expect.any(Function)
    )
  })

  it('collapses internal magazine whitespace for the scoped query and cache key', async () => {
    const { service, repository, cacheService } = make()
    repository.findReflectedScopedPeriodsInRange.mockResolvedValue([])
    repository.findRankingRecordsByPeriodIds.mockResolvedValue([])
    repository.findSeriesTitlesByIds.mockResolvedValue([])

    await service.getAggregate({
      magazine: 'Weekly  Jump',
      publicationType: PublicationType.WEEKLY,
      level: 'YEAR',
      year: 2026
    })

    expect(repository.findReflectedScopedPeriodsInRange).toHaveBeenCalledWith(
      'Weekly Jump',
      PublicationType.WEEKLY,
      new Date('2026-01-01T00:00:00.000Z'),
      new Date('2027-01-01T00:00:00.000Z')
    )
    const expectedHash = createHash('sha256').update('Weekly Jump').digest('hex')
    expect(cacheService.getOrSet).toHaveBeenCalledWith(
      'ranking',
      `aggregate:${expectedHash}:WEEKLY:YEAR:2026:_`,
      3600,
      expect.any(Function)
    )
  })

  it('excludes non-reflected, foreign, and legacy periods by relying on the scoped repository query', async () => {
    const { service, repository } = make()
    repository.findReflectedScopedPeriodsInRange.mockResolvedValue([])
    repository.findRankingRecordsByPeriodIds.mockResolvedValue([])
    repository.findSeriesTitlesByIds.mockResolvedValue([])

    const result = await service.getAggregate({
      magazine: 'Jump',
      publicationType: PublicationType.WEEKLY,
      level: 'YEAR',
      year: 2026
    })

    expect(repository.findRankingRecordsByPeriodIds).toHaveBeenCalledWith([])
    expect(result).toMatchObject({ reflectedIssueCount: 0, items: [] })
  })

  it('uses participation count then series id as deterministic ties, never raw vote totals', async () => {
    const { service, repository } = make()
    repository.findReflectedScopedPeriodsInRange.mockResolvedValue([period('p1'), period('p2')])
    repository.findRankingRecordsByPeriodIds.mockResolvedValue([
      { seriesId: 'z', surveyPeriodId: 'p1', voteCount: 1000, normalizedScore: 0.5 },
      { seriesId: 'a', surveyPeriodId: 'p1', voteCount: 1, normalizedScore: 0.5 },
      { seriesId: 'a', surveyPeriodId: 'p2', voteCount: 1, normalizedScore: 0.5 },
      { seriesId: 'b', surveyPeriodId: 'p1', voteCount: 9000, normalizedScore: 0.5 },
      { seriesId: 'b', surveyPeriodId: 'p2', voteCount: 1, normalizedScore: 0.5 }
    ])
    repository.findSeriesTitlesByIds.mockResolvedValue([])

    const result = await service.getAggregate({
      magazine: 'Jump',
      publicationType: PublicationType.WEEKLY,
      level: 'YEAR',
      year: 2026
    })

    expect(result.items.map((item) => item.seriesId)).toEqual(['a', 'b', 'z'])
  })

  it('adds only the latest per-series internal risk signals to the authenticated aggregate', async () => {
    const { service, repository } = make()
    repository.findReflectedScopedPeriodsInRange.mockResolvedValue([period('p1'), period('p2')])
    repository.findRankingRecordsByPeriodIds.mockResolvedValue([
      { seriesId: 'a', surveyPeriodId: 'p1', voteCount: 4, normalizedScore: 0.4 },
      { seriesId: 'a', surveyPeriodId: 'p2', voteCount: 6, normalizedScore: 0.6 }
    ])
    repository.findInternalRankingRecordsByPeriodIds.mockResolvedValue([
      {
        seriesId: 'a',
        surveyPeriodId: 'p2',
        isAtRisk: true,
        riskLevel: RiskLevel.MEDIUM,
        isReliable: true,
        recordedAt: new Date('2026-07-08T00:00:00.000Z')
      },
      {
        seriesId: 'a',
        surveyPeriodId: 'p1',
        isAtRisk: false,
        riskLevel: RiskLevel.NONE,
        isReliable: false,
        recordedAt: new Date('2026-07-01T00:00:00.000Z')
      }
    ])
    repository.findSeriesTitlesByIds.mockResolvedValue([{ id: 'a', title: 'A' }])

    const result = await service.getInternalAggregate({
      magazine: ' Jump ',
      publicationType: PublicationType.WEEKLY,
      level: 'YEAR',
      year: 2026
    })

    expect(result.items[0]).toEqual(
      expect.objectContaining({ isAtRisk: true, riskLevel: RiskLevel.MEDIUM, isReliable: true })
    )
    expect(repository.findInternalRankingRecordsByPeriodIds).toHaveBeenCalledWith(['p1', 'p2'])
  })

  it('keeps the public aggregate result free of internal risk signals', async () => {
    const { service, repository } = make()
    repository.findReflectedScopedPeriodsInRange.mockResolvedValue([period('p1')])
    repository.findRankingRecordsByPeriodIds.mockResolvedValue([
      { seriesId: 'a', surveyPeriodId: 'p1', voteCount: 4, normalizedScore: 1 }
    ])
    repository.findSeriesTitlesByIds.mockResolvedValue([{ id: 'a', title: 'A' }])

    const result = await service.getAggregate({
      magazine: 'Jump',
      publicationType: PublicationType.WEEKLY,
      level: 'YEAR',
      year: 2026
    })

    expect(result.items[0]).not.toHaveProperty('isAtRisk')
    expect(result.items[0]).not.toHaveProperty('riskLevel')
    expect(result.items[0]).not.toHaveProperty('isReliable')
    expect(repository.findInternalRankingRecordsByPeriodIds).not.toHaveBeenCalled()
  })
})

describe('RankingAggregateQuerySchema', () => {
  it('requires month only for MONTH aggregates', () => {
    expect(
      RankingAggregateQuerySchema.safeParse({
        magazine: 'Jump',
        publicationType: PublicationType.WEEKLY,
        level: 'MONTH',
        year: 2026
      }).success
    ).toBe(false)
    expect(
      RankingAggregateQuerySchema.parse({
        magazine: 'Jump',
        publicationType: PublicationType.WEEKLY,
        level: 'YEAR',
        year: '2026'
      })
    ).toEqual({ magazine: 'Jump', publicationType: PublicationType.WEEKLY, level: 'YEAR', year: 2026 })
  })
})
