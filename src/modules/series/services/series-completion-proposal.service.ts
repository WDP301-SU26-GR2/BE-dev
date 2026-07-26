import { Injectable } from '@nestjs/common'
import { AuditEntityType, SeriesStatus } from '@prisma/client'
import { isObjectId } from 'src/core/http/schemas/object-id.schema'
import { AuditService } from 'src/modules/audit/audit.service'
import { SeriesNotFoundException, SeriesNotProposableForCompletionException } from '../errors/series.errors'
import { ProposeCompletionBodyType } from '../schemas/series-schemas'
import { SeriesMessages } from '../series.messages'
import { SeriesRepository } from '../series.repo'
import { requireSeriesParticipant } from './series-participant.guard'
import { SeriesLifecycleNotificationService } from './series-lifecycle-notification.service'

@Injectable()
export class SeriesCompletionProposalService {
  constructor(
    private readonly repository: SeriesRepository,
    private readonly auditService: AuditService,
    private readonly notifications: SeriesLifecycleNotificationService
  ) {}

  async propose(seriesId: string, actorId: string, roleName: string, body: ProposeCompletionBodyType) {
    if (!isObjectId(seriesId)) throw SeriesNotFoundException
    const series = await this.repository.findById(seriesId)
    if (!series) throw SeriesNotFoundException
    requireSeriesParticipant(series, actorId)
    if (series.status !== SeriesStatus.SERIALIZED && series.status !== SeriesStatus.HIATUS) {
      throw SeriesNotProposableForCompletionException
    }
    const updated = await this.repository.setCompletionProposal(seriesId, {
      proposedByRole: roleName,
      proposedById: actorId,
      reason: body.reason,
      proposedEndingChapters: body.proposedEndingChapters ?? null,
      proposedAt: new Date()
    })
    await this.auditService.record({
      actorId,
      entityType: AuditEntityType.SERIES,
      entityId: seriesId,
      action: 'COMPLETION_PROPOSED',
      reason: body.reason
    })
    if (roleName === 'MANGAKA' && series.editorId) {
      await this.notifications.notifyOne(
        series.editorId,
        seriesId,
        'SERIES_COMPLETION_PROPOSED',
        SeriesMessages.notification.completionProposedToEditor
      )
    } else if (roleName === 'EDITOR' && series.mangakaId) {
      await this.notifications.notifyOne(
        series.mangakaId,
        seriesId,
        'SERIES_COMPLETION_PROPOSED',
        SeriesMessages.notification.completionProposedToMangaka
      )
    }
    return updated
  }
}
