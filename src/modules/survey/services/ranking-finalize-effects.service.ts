import { Injectable } from '@nestjs/common'
import { AuditEntityType, NotificationType } from '@prisma/client'
import { DomainEventBus } from 'src/core/events/domain-event-bus.service'
import { DomainEvent } from 'src/core/events/domain-events'
import { CacheService } from 'src/infrastructure/redis/cache.service'
import { AuditService } from 'src/modules/audit/audit.service'
import { NotificationService } from 'src/modules/notification/notification.service'
import { SurveyMessages } from '../survey.messages'
import { SurveyRepository } from '../survey.repo'

type RankingOutcome = { seriesId: string; isAtRisk: boolean; riskLevel: string }
type Ownership = { id: string; mangakaId: string; editorId: string | null }

@Injectable()
export class RankingFinalizeEffectsService {
  constructor(
    private readonly repository: SurveyRepository,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
    private readonly events: DomainEventBus,
    private readonly cache: CacheService
  ) {}

  async complete(command: {
    surveyPeriodId: string
    userId?: string
    periodLowData: boolean
    results: RankingOutcome[]
    ownership: Ownership[]
    severeSeriesIds: string[]
    rankingItems: Array<{ seriesId: string }>
  }) {
    await this.audit.record({
      actorId: command.userId ?? null,
      entityType: AuditEntityType.SURVEY_PERIOD,
      entityId: command.surveyPeriodId,
      action: 'RANKING_FINALIZED'
    })
    if (command.userId) {
      await this.notifications.notifySafe({
        recipientId: command.userId,
        type: NotificationType.SURVEY,
        referenceId: command.surveyPeriodId,
        referenceType: 'SURVEY_RANKING_FINALIZED',
        content: SurveyMessages.notification.rankingFinalized
      })
    }
    if (!command.periodLowData) {
      await this.notifyRankingOutcome(command.results, command.ownership, command.severeSeriesIds)
    }
    this.events.emit(DomainEvent.RankingFinalized, {
      surveyPeriodId: command.surveyPeriodId,
      rankings: command.rankingItems.map((item, index) => ({ seriesId: item.seriesId, rank: index + 1 }))
    })
    await this.cache.bumpVersion('ranking')
  }

  private async notifyRankingOutcome(results: RankingOutcome[], ownership: Ownership[], severe: string[]) {
    const ownerById = new Map(ownership.map((owner) => [owner.id, owner]))
    for (const result of results) {
      if (!result.isAtRisk) continue
      const owner = ownerById.get(result.seriesId)
      if (!owner) continue
      await this.notifyAtRisk(owner.mangakaId, result.seriesId)
      if (owner.editorId) await this.notifyAtRisk(owner.editorId, result.seriesId)
    }
    if (severe.length === 0) return
    const boardIds = await this.repository.findBoardMemberIds()
    for (const boardId of boardIds) {
      await this.notifications.notifySafe({
        recipientId: boardId,
        type: NotificationType.SURVEY,
        referenceId: severe[0],
        referenceType: 'RANKING_SEVERE_DIGEST',
        content: SurveyMessages.notification.rankingSevereDigest(severe.length)
      })
    }
  }

  private notifyAtRisk(recipientId: string, seriesId: string) {
    return this.notifications.notifySafe({
      recipientId,
      type: NotificationType.SURVEY,
      referenceId: seriesId,
      referenceType: 'RANKING_AT_RISK',
      content: SurveyMessages.notification.rankingAtRisk
    })
  }
}
