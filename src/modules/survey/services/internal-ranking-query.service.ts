import { Injectable } from '@nestjs/common'
import { RANKING_SHARED_TTL_SEC } from 'src/infrastructure/redis/cache.constant'
import { isObjectId } from 'src/core/http/schemas/object-id.schema'
import { CacheService } from 'src/infrastructure/redis/cache.service'
import {
  RankingAccessDeniedException,
  SeriesNotFoundForRankingException,
  SurveyPeriodNotFoundException
} from '../errors/survey.errors'
import { SurveyRepository } from '../survey.repo'
import { mapRankingItem } from './survey.mapper'

@Injectable()
export class InternalRankingQueryService {
  constructor(
    private readonly surveyRepository: SurveyRepository,
    private readonly cacheService: CacheService
  ) {}

  async getRankingRecords(surveyPeriodId: string) {
    if (!isObjectId(surveyPeriodId)) throw SurveyPeriodNotFoundException
    const surveyPeriod = await this.surveyRepository.findSurveyPeriodById(surveyPeriodId)
    if (!surveyPeriod) throw SurveyPeriodNotFoundException
    return this.cacheService.getOrSet('ranking', `period:${surveyPeriodId}`, RANKING_SHARED_TTL_SEC, async () => {
      const items = await this.surveyRepository.getRankingRecordsByPeriod(surveyPeriodId)
      return {
        items: items.map((item) => ({
          seriesId: item.seriesId,
          surveyPeriodId: item.surveyPeriodId,
          magazine: item.surveyPeriod?.magazine ?? null,
          publicationType: item.surveyPeriod?.publicationType ?? null,
          issueNumber: item.surveyPeriod?.issueNumber ?? null,
          voteCount: item.voteCount,
          normalizedScore: item.normalizedScore,
          rankPosition: item.rankPosition ?? undefined,
          previousRank: item.previousRank,
          rankChange: item.rankChange,
          isAtRisk: item.isAtRisk,
          riskLevel: item.riskLevel ?? 'NONE',
          consecutiveAtRiskCount: item.consecutiveAtRiskCount ?? 0,
          isReliable: item.isReliable
        }))
      }
    })
  }

  // Mangaka cần thấy hạng mình so với series khác; ranking tổng hợp không nhạy cảm per-series.
  async getBoardRanking(surveyPeriodId: string) {
    if (!isObjectId(surveyPeriodId)) throw SurveyPeriodNotFoundException
    const period = await this.surveyRepository.findSurveyPeriodById(surveyPeriodId)
    if (!period) throw SurveyPeriodNotFoundException
    return this.cacheService.getOrSet('ranking', `board:${surveyPeriodId}`, RANKING_SHARED_TTL_SEC, async () => {
      const items = await this.surveyRepository.getRankingRecordsByPeriod(surveyPeriodId)
      const sorted = [...items].sort((a, b) => (a.rankPosition ?? 0) - (b.rankPosition ?? 0))
      return {
        items: sorted.map((r) =>
          mapRankingItem({
            ...r,
            magazine: period.magazine,
            publicationType: period.publicationType,
            issueNumber: period.issueNumber
          })
        )
      }
    })
  }

  // PB-04: trend xếp hạng 1 series — scoping theo owner.
  async getSeriesTrend(seriesId: string, periods: number, caller: { userId: string; roleName: string }) {
    if (!isObjectId(seriesId)) throw SeriesNotFoundForRankingException
    const [owner] = await this.surveyRepository.findSeriesOwnershipByIds([seriesId])
    if (!owner) throw SeriesNotFoundForRankingException
    const role = caller.roleName
    const allowed =
      role === 'BOARD_MEMBER' ||
      role === 'SUPER_ADMIN' ||
      (role === 'MANGAKA' && owner.mangakaId === caller.userId) ||
      (role === 'EDITOR' && owner.editorId === caller.userId)
    if (!allowed) throw RankingAccessDeniedException
    return this.cacheService.getOrSet('ranking', `trend:${seriesId}:${periods}`, RANKING_SHARED_TTL_SEC, async () => {
      const items = await this.surveyRepository.getRankingRecordsBySeries(seriesId, periods)
      return {
        items: items
          .filter(
            (r) =>
              r.surveyPeriod == null ||
              (r.surveyPeriod.status === 'REFLECTED' &&
                r.surveyPeriod.magazine != null &&
                r.surveyPeriod.publicationType != null)
          )
          .map((r) => mapRankingItem(r))
      }
    })
  }
}
