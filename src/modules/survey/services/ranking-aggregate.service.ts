import { Injectable } from '@nestjs/common'
import { RiskLevel } from '@prisma/client'
import { createHash } from 'crypto'
import { normalizeMagazine } from 'src/core/http/schemas/magazine.schema'
import { RANKING_IMMUTABLE_TTL_SEC } from 'src/infrastructure/redis/cache.constant'
import { CacheService } from 'src/infrastructure/redis/cache.service'
import { AppConfigService } from 'src/modules/app-config/app-config.service'
import { SurveyRepository } from '../survey.repo'
import type {
  AggregateRankingRecord,
  InternalRankingAggregateResult,
  InternalRankingRecord,
  RankingAggregateItem,
  RankingAggregateLevel,
  RankingAggregateQuery,
  RankingAggregateRepository,
  RankingAggregateResult
} from './ranking-aggregate.types'

export type {
  InternalRankingAggregateResult,
  RankingAggregateItem,
  RankingAggregateLevel,
  RankingAggregateQuery,
  RankingAggregateResult
} from './ranking-aggregate.types'

@Injectable()
export class RankingAggregateService {
  constructor(
    private readonly surveyRepository: SurveyRepository,
    private readonly appConfigService: AppConfigService,
    private readonly cacheService: CacheService
  ) {}

  async getAggregate(query: RankingAggregateQuery): Promise<RankingAggregateResult> {
    return this.getAggregateResult(query, false)
  }

  async getInternalAggregate(query: RankingAggregateQuery): Promise<InternalRankingAggregateResult> {
    return this.getAggregateResult(query, true)
  }

  private getAggregateResult(
    query: RankingAggregateQuery,
    includeInternalSignals: false
  ): Promise<RankingAggregateResult>
  private getAggregateResult(
    query: RankingAggregateQuery,
    includeInternalSignals: true
  ): Promise<InternalRankingAggregateResult>
  private async getAggregateResult(
    query: RankingAggregateQuery,
    includeInternalSignals: boolean
  ): Promise<RankingAggregateResult | InternalRankingAggregateResult> {
    const magazine = normalizeMagazine(query.magazine)
    const baseSuffix = this.cacheSuffix({ ...query, magazine })
    const suffix = includeInternalSignals ? `internal:${baseSuffix}` : baseSuffix

    return this.cacheService.getOrSet('ranking', suffix, RANKING_IMMUTABLE_TTL_SEC, async () => {
      const { from, to } = this.resolveRange(query.level, query.year, query.month)
      const [periods, config] = await Promise.all([
        this.aggregateRepository.findReflectedScopedPeriodsInRange(magazine, query.publicationType, from, to),
        this.appConfigService.get()
      ])
      const reflectedIssueCount = periods.length
      const periodIds = periods.map((period) => period.id)
      const [records, internalRecords] = await Promise.all([
        this.aggregateRepository.findRankingRecordsByPeriodIds(periodIds),
        includeInternalSignals
          ? this.aggregateRepository.findInternalRankingRecordsByPeriodIds(periodIds)
          : Promise.resolve([])
      ])
      const titleBySeriesId = new Map(
        (
          await this.aggregateRepository.findSeriesTitlesByIds([...new Set(records.map((record) => record.seriesId))])
        ).map((series) => [series.id, series.title])
      )

      const publicItems = this.aggregate(
        records,
        reflectedIssueCount,
        config.rankingAggregateMinCoverageRatio,
        titleBySeriesId
      )
      const latestSignals = new Map<string, InternalRankingRecord>()
      for (const record of internalRecords) {
        if (!latestSignals.has(record.seriesId)) latestSignals.set(record.seriesId, record)
      }
      const items = includeInternalSignals
        ? publicItems.map((item) => {
            const signal = latestSignals.get(item.seriesId)
            return {
              ...item,
              isAtRisk: signal?.isAtRisk ?? false,
              riskLevel: signal?.riskLevel ?? RiskLevel.NONE,
              isReliable: signal?.isReliable ?? false
            }
          })
        : publicItems
      return {
        magazine,
        publicationType: query.publicationType,
        level: query.level,
        year: query.year,
        ...(query.level === 'MONTH' ? { month: query.month } : {}),
        reflectedIssueCount,
        items
      }
    })
  }

  private get aggregateRepository(): RankingAggregateRepository {
    // Task 5 repository contract; the concrete SurveyRepository owns the Prisma queries.
    return this.surveyRepository
  }

  private cacheSuffix(query: RankingAggregateQuery): string {
    const magazineHash = createHash('sha256').update(query.magazine).digest('hex')
    return `aggregate:${magazineHash}:${query.publicationType}:${query.level}:${query.year}:${query.month ?? '_'}`
  }

  private resolveRange(level: RankingAggregateLevel, year: number, month?: number): { from: Date; to: Date } {
    if (level === 'YEAR') {
      return { from: new Date(Date.UTC(year, 0, 1)), to: new Date(Date.UTC(year + 1, 0, 1)) }
    }

    if (month == null) throw new Error('month is required for monthly ranking aggregation')
    return { from: new Date(Date.UTC(year, month - 1, 1)), to: new Date(Date.UTC(year, month, 1)) }
  }

  private aggregate(
    records: AggregateRankingRecord[],
    reflectedIssueCount: number,
    minCoverageRatio: number,
    titleBySeriesId: Map<string, string>
  ): RankingAggregateItem[] {
    const totals = new Map<
      string,
      { totalWeightedVoteCount: number; normalizedScoreTotal: number; periodIds: Set<string> }
    >()

    for (const record of records) {
      const total = totals.get(record.seriesId) ?? {
        totalWeightedVoteCount: 0,
        normalizedScoreTotal: 0,
        periodIds: new Set<string>()
      }
      total.totalWeightedVoteCount += record.voteCount
      total.normalizedScoreTotal += record.normalizedScore
      total.periodIds.add(record.surveyPeriodId)
      totals.set(record.seriesId, total)
    }

    const items = [...totals.entries()].map(([seriesId, total]) => {
      const participatedIssueCount = total.periodIds.size
      const participationCoverage = reflectedIssueCount === 0 ? 0 : participatedIssueCount / reflectedIssueCount
      return {
        rankPosition: 0,
        seriesId,
        seriesTitle: titleBySeriesId.get(seriesId) ?? null,
        reflectedIssueCount,
        totalWeightedVoteCount: total.totalWeightedVoteCount,
        participatedIssueCount,
        participationCoverage,
        averageNormalizedScore: total.normalizedScoreTotal / participatedIssueCount,
        isProvisional: participationCoverage < minCoverageRatio
      }
    })

    return items
      .sort(
        (left, right) =>
          right.averageNormalizedScore - left.averageNormalizedScore ||
          right.participatedIssueCount - left.participatedIssueCount ||
          left.seriesId.localeCompare(right.seriesId)
      )
      .map((item, index) => ({ ...item, rankPosition: index + 1 }))
  }
}
