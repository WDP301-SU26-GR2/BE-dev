import { Injectable } from '@nestjs/common'
import { PublicationType } from '@prisma/client'
import { isObjectId } from 'src/core/http/schemas/object-id.schema'
import { VOTE_CTX_TTL_SEC } from 'src/infrastructure/redis/cache.constant'
import { CacheService } from 'src/infrastructure/redis/cache.service'
import { SurveyPeriodNotFoundException, SurveyPeriodNotOpenException } from '../errors/survey.errors'
import { SurveyRepository } from '../survey.repo'
import { SurveyConfigService } from './survey-config.service'

@Injectable()
export class PublicVoteContextQueryService {
  constructor(
    private readonly repository: SurveyRepository,
    private readonly configService: SurveyConfigService,
    private readonly cache: CacheService
  ) {}

  async getVoteContext(periodId?: string) {
    const legacyType =
      periodId && Object.values(PublicationType).includes(periodId as PublicationType)
        ? (periodId as PublicationType)
        : undefined
    if (!periodId || legacyType) {
      return this.cache.getOrSet('votectx', `ctx:legacy:${legacyType ?? 'ALL'}`, VOTE_CTX_TTL_SEC, async () => {
        const config = await this.configService.get()
        const period = await this.repository.findLatestOpenSurveyPeriod()
        if (!period) return { period: null, series: [], maxSeriesPerVote: config.maxSeriesPerVote }
        const series = await this.repository.findManySerializedSeriesPublic(legacyType)
        return {
          period: {
            id: period.id,
            issueNumber: period.issueNumber ?? null,
            reflectedIssueNumber: period.reflectedIssueNumber ?? null,
            startDate: period.startDate ? period.startDate.toISOString() : null,
            endDate: period.endDate ? period.endDate.toISOString() : null
          },
          series: series.map((item) => ({
            ...item,
            coverImage: item.coverImage ?? null,
            demographic: item.demographic ?? null,
            publicationType: item.publicationType as PublicationType
          })),
          maxSeriesPerVote: config.maxSeriesPerVote
        }
      })
    }
    if (!isObjectId(periodId)) throw SurveyPeriodNotFoundException
    return this.cache.getOrSet('votectx', `ctx:${periodId}`, VOTE_CTX_TTL_SEC, async () => {
      const config = await this.configService.get()
      const period = await this.repository.findSurveyPeriodById(periodId)
      if (!period) throw SurveyPeriodNotFoundException
      if (period.status !== 'OPEN') throw SurveyPeriodNotOpenException
      const publicationType = period.publicationType
      if (!period.magazine || !publicationType || !period.issueNumber || period.eligibleSeriesIds.length === 0) {
        throw SurveyPeriodNotOpenException
      }
      const series = await this.repository.findPublicSeriesByIds(period.eligibleSeriesIds)
      return {
        period: {
          id: period.id,
          magazine: period.magazine,
          publicationType,
          issueNumber: period.issueNumber ?? null,
          reflectedIssueNumber: period.reflectedIssueNumber ?? null,
          startDate: period.startDate ? period.startDate.toISOString() : null,
          endDate: period.endDate ? period.endDate.toISOString() : null
        },
        series: series.map((item) => ({
          id: item.id,
          title: item.title,
          coverImage: item.coverImage ?? null,
          genres: item.genres,
          demographic: item.demographic ?? null,
          publicationType
        })),
        maxSeriesPerVote: config.maxSeriesPerVote
      }
    })
  }
}
