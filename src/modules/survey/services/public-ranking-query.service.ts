import { Injectable } from '@nestjs/common'
import { PublicationType } from '@prisma/client'
import { isObjectId } from 'src/core/http/schemas/object-id.schema'
import { RANKING_IMMUTABLE_TTL_SEC, VOTE_CTX_TTL_SEC } from 'src/infrastructure/redis/cache.constant'
import { CacheService } from 'src/infrastructure/redis/cache.service'
import { SurveyPeriodNotFinalizedException, SurveyPeriodNotFoundException } from '../errors/survey.errors'
import { SurveyRepository } from '../survey.repo'

@Injectable()
export class PublicRankingQueryService {
  constructor(
    private readonly repository: SurveyRepository,
    private readonly cache: CacheService
  ) {}

  async getLatestVoteResults(magazine?: string, publicationType?: PublicationType) {
    const legacyType =
      magazine && Object.values(PublicationType).includes(magazine as PublicationType)
        ? (magazine as PublicationType)
        : undefined
    if (!magazine || !publicationType || legacyType) {
      const period = await this.cache.getOrSet('ranking', 'latest-period', VOTE_CTX_TTL_SEC, async () => {
        const found = await this.repository.findLatestReflectedPeriod()
        return found
          ? {
              id: found.id,
              issueNumber: found.issueNumber ?? null,
              reflectedIssueNumber: found.reflectedIssueNumber ?? null,
              startDate: found.startDate?.toISOString() ?? null,
              endDate: found.endDate?.toISOString() ?? null
            }
          : null
      })
      if (!period) return { period: null, results: [] }
      const base = await this.getVoteResults(period.id, legacyType)
      return {
        period: {
          id: period.id,
          issueNumber: period.issueNumber ?? null,
          reflectedIssueNumber: period.reflectedIssueNumber ?? null,
          startDate: period.startDate,
          endDate: period.endDate
        },
        results: base.results
      }
    }
    const canonicalMagazine = magazine.trim()
    const period = await this.cache.getOrSet(
      'ranking',
      `latest-period:${canonicalMagazine}:${publicationType}`,
      VOTE_CTX_TTL_SEC,
      async () => {
        const found = await this.repository.findLatestReflectedScopedPeriod(canonicalMagazine, publicationType)
        return found
          ? {
              id: found.id,
              issueNumber: found.issueNumber ?? null,
              reflectedIssueNumber: found.reflectedIssueNumber ?? null,
              startDate: found.startDate?.toISOString() ?? null,
              endDate: found.endDate?.toISOString() ?? null
            }
          : null
      }
    )
    if (!period) return { period: null, results: [] }
    const base = await this.getVoteResults(period.id)
    return {
      period: {
        id: period.id,
        issueNumber: period.issueNumber ?? null,
        reflectedIssueNumber: period.reflectedIssueNumber ?? null,
        startDate: period.startDate,
        endDate: period.endDate
      },
      results: base.results
    }
  }

  async getReflectedPeriods(magazine: string | number, publicationType?: PublicationType, limit = 12) {
    if (typeof magazine === 'number') {
      return this.cache.getOrSet('ranking', `periods:${magazine}`, RANKING_IMMUTABLE_TTL_SEC, async () => {
        const rows = await this.repository.findReflectedPeriods(magazine)
        return { items: rows.map(toPeriodSummary) }
      })
    }
    const canonicalMagazine = magazine.trim()
    return this.cache.getOrSet(
      'ranking',
      `periods:${canonicalMagazine}:${publicationType}:${limit}`,
      RANKING_IMMUTABLE_TTL_SEC,
      async () => {
        const rows = await this.repository.findReflectedScopedPeriods(canonicalMagazine, publicationType!, limit)
        return { items: rows.map(toPeriodSummary) }
      }
    )
  }

  async getVoteResults(surveyPeriodId: string, legacyType?: PublicationType) {
    if (!isObjectId(surveyPeriodId)) throw SurveyPeriodNotFoundException
    return this.cache.getOrSet(
      'ranking',
      `results:${surveyPeriodId}:${legacyType ?? 'ALL'}`,
      RANKING_IMMUTABLE_TTL_SEC,
      async () => {
        const period = await this.repository.findSurveyPeriodById(surveyPeriodId)
        if (!period) throw SurveyPeriodNotFoundException
        if (period.status !== 'REFLECTED') throw SurveyPeriodNotFinalizedException
        const records = await this.repository.getRankingRecordsByPeriod(surveyPeriodId)
        const titles = (await this.repository.findSeriesTitlesByIds(
          records.map((record) => record.seriesId)
        )) as Array<{
          id: string
          title: string
          publicationType: PublicationType | null
        }>
        const seriesById = new Map<string, { title: string; publicationType: PublicationType | null }>(
          titles.map((item): [string, { title: string; publicationType: PublicationType | null }] => [
            item.id,
            { title: item.title, publicationType: item.publicationType ?? null }
          ])
        )
        const results = records
          .map((record) => ({
            rankPosition: record.rankPosition ?? null,
            seriesId: record.seriesId,
            seriesTitle: seriesById.get(record.seriesId)?.title ?? null,
            publicationType: seriesById.get(record.seriesId)?.publicationType ?? null,
            voteCount: record.voteCount,
            rankChange: record.rankChange ?? null
          }))
          .filter((record) => !legacyType || record.publicationType === legacyType)
        return {
          surveyPeriodId,
          issueNumber: period.issueNumber ?? null,
          results
        }
      }
    )
  }
}

function toPeriodSummary(period: {
  id: string
  issueNumber?: number | null
  reflectedIssueNumber?: number | null
  startDate?: Date | null
  endDate?: Date | null
}) {
  return {
    id: period.id,
    issueNumber: period.issueNumber ?? null,
    reflectedIssueNumber: period.reflectedIssueNumber ?? null,
    startDate: period.startDate?.toISOString() ?? null,
    endDate: period.endDate?.toISOString() ?? null
  }
}
