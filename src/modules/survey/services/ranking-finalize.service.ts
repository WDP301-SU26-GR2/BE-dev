import { Injectable } from '@nestjs/common'
import { PublicationType } from '@prisma/client'
import { isObjectId } from 'src/core/http/schemas/object-id.schema'
import { AppConfigService } from 'src/modules/app-config/app-config.service'
import {
  RankingFinalizeNotAllowedException,
  SurveyPeriodAlreadyFinalizedException,
  SurveyPeriodNotFoundException
} from '../errors/survey.errors'
import { SurveyMessages } from '../survey.messages'
import { SurveyRepository } from '../survey.repo'
import { SURVEY_CONFIG } from '../survey.constant'
import { bottomThirdCount, computeRiskLevel, isRiskEvaluable, nextConsecutiveCount } from './ranking-finalize.helpers'
import { RankingFinalizeEffectsService } from './ranking-finalize-effects.service'
import { RankingFinalizePersistenceService } from './ranking-finalize-persistence.service'

export const DEFAULT_LOW_VOTE_RELIABILITY_THRESHOLD = 10

@Injectable()
export class RankingFinalizeService {
  constructor(
    private readonly surveyRepository: SurveyRepository,
    private readonly appConfigService: AppConfigService,
    private readonly effectsService: RankingFinalizeEffectsService,
    private readonly persistenceService: RankingFinalizePersistenceService
  ) {}

  async finalizeRanking(surveyPeriodId: string, userId?: string) {
    if (!isObjectId(surveyPeriodId)) throw SurveyPeriodNotFoundException
    const surveyPeriod = await this.surveyRepository.findSurveyPeriodById(surveyPeriodId)
    if (!surveyPeriod) throw SurveyPeriodNotFoundException
    if (surveyPeriod.status === 'REFLECTED') throw SurveyPeriodAlreadyFinalizedException
    if (surveyPeriod.status !== 'CLOSED') throw RankingFinalizeNotAllowedException

    const surveyData = await this.surveyRepository.getSurveyDataByPeriod(surveyPeriodId)
    const readerVotes = await this.surveyRepository.getReaderVotesByPeriod(surveyPeriodId)
    const isScopedPeriod =
      surveyPeriod.magazine != null &&
      surveyPeriod.publicationType != null &&
      surveyPeriod.issueNumber != null &&
      surveyPeriod.eligibleSeriesIds.length > 0
    const previousPeriod = isScopedPeriod
      ? await this.surveyRepository.findPreviousScopedSurveyPeriod(
          surveyPeriodId,
          surveyPeriod.magazine!,
          surveyPeriod.publicationType!
        )
      : await this.surveyRepository.findPreviousSurveyPeriod(surveyPeriodId)
    const previousRecords = previousPeriod
      ? await this.surveyRepository.getRankingRecordsByPeriod(previousPeriod.id)
      : []

    const seriesScores = new Map<string, { score: number; offlineVotes: number }>()
    const eligibleSeriesIds = isScopedPeriod ? surveyPeriod.eligibleSeriesIds : []
    const eligibleSeriesSet = new Set(eligibleSeriesIds)
    for (const seriesId of eligibleSeriesIds) {
      seriesScores.set(seriesId, { score: 0, offlineVotes: 0 })
    }

    const addSeriesScore = (seriesId: string, deltaScore: number, deltaOfflineVotes = 0) => {
      const current = seriesScores.get(seriesId) ?? { score: 0, offlineVotes: 0 }
      current.score += deltaScore
      current.offlineVotes += deltaOfflineVotes
      seriesScores.set(seriesId, current)
    }

    for (const data of surveyData) {
      for (const entry of data.entries) {
        if (!entry.seriesId || (isScopedPeriod && !eligibleSeriesSet.has(entry.seriesId))) continue
        addSeriesScore(entry.seriesId, entry.voteCount, entry.voteCount)
      }
    }

    for (const vote of readerVotes) {
      for (const seriesId of vote.seriesIds) {
        if (isScopedPeriod && !eligibleSeriesSet.has(seriesId)) continue
        addSeriesScore(seriesId, vote.voteWeight)
      }
    }

    const rankingItems = Array.from(seriesScores.entries()).map(([seriesId, value]) => ({
      seriesId,
      score: value.score,
      offlineVotes: value.offlineVotes
    }))

    rankingItems.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      if (b.offlineVotes !== a.offlineVotes) return b.offlineVotes - a.offlineVotes
      const prevRankA =
        previousRecords.find((record) => record.seriesId === a.seriesId)?.rankPosition ?? Number.MAX_SAFE_INTEGER
      const prevRankB =
        previousRecords.find((record) => record.seriesId === b.seriesId)?.rankPosition ?? Number.MAX_SAFE_INTEGER
      if (prevRankA !== prevRankB) return prevRankA - prevRankB
      return a.seriesId.localeCompare(b.seriesId)
    })

    // 2. B-VOT-05: gather context for at-risk + reliability evaluation.
    // Read AppConfig + VotingConfig once (cached 30s in services).
    const appConfig = await this.appConfigService.get()
    const seriesIds = rankingItems.map((i) => i.seriesId)
    const publishedCounts =
      seriesIds.length > 0
        ? await this.surveyRepository.countPublishedChaptersBySeriesIds(seriesIds)
        : new Map<string, number>()
    const ownership = seriesIds.length > 0 ? await this.surveyRepository.findSeriesOwnershipByIds(seriesIds) : []
    const statusById = new Map(ownership.map((o) => [o.id, o.status]))
    const typeById = new Map(ownership.map((o) => [o.id, o.publicationType ?? null]))
    const heldThreshold = new Date(Date.now() - appConfig.hiatusTooLongDays * 86_400_000)
    const heldSeries =
      seriesIds.length > 0
        ? await this.surveyRepository.findHeldChapterSeriesIds(seriesIds, heldThreshold)
        : new Set<string>()

    // 3. Compute per-record state — Spec 5 §3 (tiering) + §4 (reliability).
    // Option B: bottom-1/3 at-risk tính TRONG TỪNG publicationType (Tuần xét trong Tuần, Tháng trong
    // Tháng — 2 tạp chí khác reader pool). rankPosition vẫn GLOBAL (giữ read-path bảng tổng).
    const inBottomOfType = new Map<string, boolean>()
    const typeBuckets = new Map<PublicationType | null, string[]>()
    for (const it of rankingItems) {
      const t = typeById.get(it.seriesId) ?? null
      const bucket = typeBuckets.get(t) ?? []
      bucket.push(it.seriesId)
      typeBuckets.set(t, bucket)
    }
    for (const ids of typeBuckets.values()) {
      const n = ids.length
      const bottom = bottomThirdCount(n)
      ids.forEach((id, j) => inBottomOfType.set(id, j >= n - bottom))
    }
    const periodTotal = rankingItems.reduce((s, i) => s + i.score, 0)
    const periodLowData = periodTotal < appConfig.lowVoteReliabilityThreshold
    const minChapters = SURVEY_CONFIG.minChaptersForRiskEvaluation

    // 4. Materialize RankingRecord rows + collect per-series result for notify (Task 8).
    const perSeriesResult: Array<{ seriesId: string; isAtRisk: boolean; riskLevel: string }> = []
    const severeSeriesIds: string[] = []
    const rankingRecords: Array<{
      seriesId: string
      surveyPeriodId: string
      rankPosition: number
      voteCount: number
      normalizedScore: number
      previousRank: number | null
      rankChange: number | null
      isAtRisk: boolean
      riskLevel: 'NONE' | 'LOW' | 'MEDIUM' | 'SEVERE'
      consecutiveAtRiskCount: number
      isReliable: boolean
    }> = []

    for (let index = 0; index < rankingItems.length; index++) {
      const item = rankingItems[index]
      const previous = previousRecords.find((record) => record.seriesId === item.seriesId)
      const previousRank = previous?.rankPosition ?? null
      const rankChange = previousRank != null ? previousRank - (index + 1) : null

      // B-VOT-05: loại khỏi at-risk nếu <8 chương PUBLISHED, hoặc bộ truyện đã tạm ngưng / đã chốt kết thúc.
      const isAtRisk =
        isRiskEvaluable(statusById.get(item.seriesId), publishedCounts.get(item.seriesId) ?? 0, minChapters) &&
        inBottomOfType.get(item.seriesId) === true
      const prevCount = previous?.consecutiveAtRiskCount ?? 0
      const consecutiveAtRiskCount = nextConsecutiveCount(prevCount, isAtRisk)
      const riskLevel = computeRiskLevel(isAtRisk, consecutiveAtRiskCount)
      const isReliable = !periodLowData && !heldSeries.has(item.seriesId)

      rankingRecords.push({
        seriesId: item.seriesId,
        surveyPeriodId,
        rankPosition: index + 1,
        voteCount: item.score,
        normalizedScore: periodTotal > 0 ? item.score / periodTotal : 0,
        previousRank,
        rankChange,
        isAtRisk,
        riskLevel,
        consecutiveAtRiskCount,
        isReliable
      })

      perSeriesResult.push({ seriesId: item.seriesId, isAtRisk, riskLevel })
      if (riskLevel === 'SEVERE') severeSeriesIds.push(item.seriesId)
    }

    await this.persistenceService.persist(surveyPeriodId, isScopedPeriod, rankingRecords)

    // 5. B-VOT-05 AC5 + B-VOT-07: notify Mangaka/Editor/Board, bỏ qua nếu kỳ thiếu dữ liệu.
    await this.effectsService.complete({
      surveyPeriodId,
      userId,
      periodLowData,
      results: perSeriesResult,
      ownership,
      severeSeriesIds,
      rankingItems
    })
    return { message: SurveyMessages.response.rankingFinalized }
  }
}
