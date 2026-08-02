import type { PublicationType, RiskLevel } from '@prisma/client'

export type RankingAggregateLevel = 'MONTH' | 'YEAR'

export type RankingAggregateQuery = {
  magazine: string
  publicationType: PublicationType
  level: RankingAggregateLevel
  year: number
  month?: number
}

export type ScopedPeriod = { id: string }

export type AggregateRankingRecord = {
  seriesId: string
  surveyPeriodId: string
  voteCount: number
  normalizedScore: number
}

export type InternalRankingRecord = {
  seriesId: string
  surveyPeriodId: string
  isAtRisk: boolean
  riskLevel: RiskLevel
  isReliable: boolean
  recordedAt: Date
}

export type RankingAggregateRepository = {
  findReflectedScopedPeriodsInRange(
    magazine: string,
    publicationType: PublicationType,
    from: Date,
    to: Date
  ): Promise<ScopedPeriod[]>
  findRankingRecordsByPeriodIds(periodIds: string[]): Promise<AggregateRankingRecord[]>
  findInternalRankingRecordsByPeriodIds(periodIds: string[]): Promise<InternalRankingRecord[]>
  findSeriesTitlesByIds(seriesIds: string[]): Promise<Array<{ id: string; title: string }>>
}

export type RankingAggregateItem = {
  rankPosition: number
  seriesId: string
  seriesTitle: string | null
  reflectedIssueCount: number
  totalWeightedVoteCount: number
  participatedIssueCount: number
  participationCoverage: number
  averageNormalizedScore: number
  isProvisional: boolean
}

export type RankingAggregateResult = {
  magazine: string
  publicationType: PublicationType
  level: RankingAggregateLevel
  year: number
  month?: number
  reflectedIssueCount: number
  items: RankingAggregateItem[]
}

export type InternalRankingAggregateResult = Omit<RankingAggregateResult, 'items'> & {
  items: Array<
    RankingAggregateItem & {
      isAtRisk: boolean
      riskLevel: RiskLevel
      isReliable: boolean
    }
  >
}
