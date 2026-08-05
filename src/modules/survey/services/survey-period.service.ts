import { Injectable } from '@nestjs/common'
import { AuditEntityType, NotificationType } from '@prisma/client'
import { CacheService } from 'src/infrastructure/redis/cache.service'
import { isObjectId } from 'src/core/http/schemas/object-id.schema'
import { AuditService } from 'src/modules/audit/audit.service'
import { NotificationService } from 'src/modules/notification/notification.service'
import { CreateSurveyPeriodBodyDto, SurveyPeriodListQueryDto, UpdateSurveyPeriodStatusBodyDto } from '../dto/survey.dto'
import {
  DuplicateSurveyPeriodScopeException,
  SeriesNotVotableException,
  SurveyPeriodInvalidTransitionException,
  SurveyPeriodNotFoundException
} from '../errors/survey.errors'
import { SurveyMessages } from '../survey.messages'
import { SurveyRepository } from '../survey.repo'
import { VOTE_ELIGIBLE_SERIES_STATUSES } from '../survey.constant'
import { EligibleSeriesQueryDto } from '../dto/survey.dto'
import { mapReaderVoteListItem, mapSurveyPeriod } from './survey.mapper'

@Injectable()
export class SurveyPeriodService {
  constructor(
    private readonly surveyRepository: SurveyRepository,
    private readonly notificationService: NotificationService,
    private readonly auditService: AuditService,
    private readonly cacheService: CacheService
  ) {}

  async getSurveyPeriods(query: SurveyPeriodListQueryDto) {
    const filter = { ...query, ...(query.magazine ? { magazine: query.magazine.trim() } : {}) }
    const { items, total } = await this.surveyRepository.findManySurveyPeriods(filter)
    return {
      items: items.map((period) => mapSurveyPeriod(period)),
      total,
      limit: query.limit,
      offset: query.offset
    }
  }

  async getSurveyPeriodById(id: string) {
    if (!isObjectId(id)) throw SurveyPeriodNotFoundException
    const surveyPeriod = await this.surveyRepository.findSurveyPeriodById(id)
    if (!surveyPeriod) throw SurveyPeriodNotFoundException
    return mapSurveyPeriod(surveyPeriod)
  }

  async getSurveyPeriodVotes(id: string) {
    if (!isObjectId(id)) throw SurveyPeriodNotFoundException
    const surveyPeriod = await this.surveyRepository.findSurveyPeriodById(id)
    if (!surveyPeriod) throw SurveyPeriodNotFoundException
    const votes = await this.surveyRepository.getReaderVotesByPeriod(id)
    return votes.map((vote) => mapReaderVoteListItem(vote))
  }

  async getSurveyPeriodSurveyData(id: string) {
    if (!isObjectId(id)) throw SurveyPeriodNotFoundException
    const surveyPeriod = await this.surveyRepository.findSurveyPeriodById(id)
    if (!surveyPeriod) throw SurveyPeriodNotFoundException
    return this.surveyRepository.getSurveyDataByPeriod(id)
  }

  // BR-VOTE-05: danh sách series Super Admin được phép chọn khi mở kỳ — dùng CHUNG hằng số với validate ở
  // `createSurveyPeriod` nên không bao giờ lệch giữa "thứ FE hiển thị" và "thứ BE chấp nhận".
  async getEligibleSeries(query: EligibleSeriesQueryDto) {
    const items = await this.surveyRepository.findVoteEligibleSeries(
      query.magazine.trim(),
      query.publicationType,
      VOTE_ELIGIBLE_SERIES_STATUSES
    )
    return { items, total: items.length }
  }

  async createSurveyPeriod(body: CreateSurveyPeriodBodyDto, userId?: string) {
    // HTTP validation requires scope. Keep direct legacy service callers working
    // for historic unit fixtures; they cannot create unscoped periods through API.
    if (!body.magazine || !body.publicationType || !body.eligibleSeriesIds?.length) {
      const surveyPeriod = await this.surveyRepository.createSurveyPeriod(body)
      if (userId) {
        await this.notificationService.notifySafe({
          recipientId: userId,
          type: NotificationType.SURVEY,
          referenceId: surveyPeriod.id,
          referenceType: 'SURVEY_PERIOD_CREATED',
          content: SurveyMessages.notification.surveyPeriodCreated
        })
      }
      await this.cacheService.bumpVersion('votectx')
      await this.cacheService.bumpVersion('ranking')
      return mapSurveyPeriod(surveyPeriod)
    }
    const magazine = body.magazine.trim()
    const duplicate = await this.surveyRepository.findScopedSurveyPeriod(
      magazine,
      body.publicationType,
      body.issueNumber
    )
    if (duplicate) throw DuplicateSurveyPeriodScopeException

    const eligible = await this.surveyRepository.findSeriesOwnershipByIds(body.eligibleSeriesIds)
    if (
      eligible.length !== body.eligibleSeriesIds.length ||
      eligible.some(
        (series) =>
          !VOTE_ELIGIBLE_SERIES_STATUSES.includes(series.status) ||
          series.magazine?.trim() !== magazine ||
          series.publicationType !== body.publicationType
      )
    ) {
      throw SeriesNotVotableException
    }

    const surveyPeriod = await this.surveyRepository.createSurveyPeriod(body)
    if (userId) {
      await this.notificationService.notifySafe({
        recipientId: userId,
        type: NotificationType.SURVEY,
        referenceId: surveyPeriod.id,
        referenceType: 'SURVEY_PERIOD_CREATED',
        content: SurveyMessages.notification.surveyPeriodCreated
      })
    }
    await this.cacheService.bumpVersion('votectx')
    await this.cacheService.bumpVersion('ranking')
    return mapSurveyPeriod(surveyPeriod)
  }

  async updateSurveyPeriodStatus(id: string, body: UpdateSurveyPeriodStatusBodyDto, userId?: string) {
    if (!isObjectId(id)) throw SurveyPeriodNotFoundException
    const surveyPeriod = await this.surveyRepository.findSurveyPeriodById(id)
    if (!surveyPeriod) throw SurveyPeriodNotFoundException
    const allowed =
      (surveyPeriod.status === 'DRAFT' && body.status === 'OPEN') ||
      (surveyPeriod.status === 'OPEN' && body.status === 'CLOSED')
    if (!allowed) throw SurveyPeriodInvalidTransitionException
    const updated = await this.surveyRepository.updateSurveyPeriodStatus(id, body.status)
    await this.auditService.record({
      actorId: userId ?? null,
      entityType: AuditEntityType.SURVEY_PERIOD,
      entityId: id,
      action: 'TRANSITION',
      fromState: surveyPeriod.status,
      toState: body.status
    })
    if (userId) {
      await this.notificationService.notifySafe({
        recipientId: userId,
        type: NotificationType.SURVEY,
        referenceId: updated.id,
        referenceType: 'SURVEY_PERIOD_STATUS_UPDATED',
        content: SurveyMessages.notification.surveyPeriodStatusUpdated
      })
    }
    await this.cacheService.bumpVersion('votectx')
    await this.cacheService.bumpVersion('ranking')
    return mapSurveyPeriod(updated)
  }
}
