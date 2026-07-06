import { Injectable, Logger } from '@nestjs/common'
import { NotificationType, PublicationType, SeriesStatus } from '@prisma/client'
import { DomainEvent } from 'src/core/events/domain-events'
import { DomainEventBus } from 'src/core/events/domain-event-bus.service'
import { NotificationService } from 'src/modules/notification/notification.service'
import { SeriesMessages } from '../series.messages'
import { SeriesNotFoundException, SeriesNotInEndingStateException } from '../errors/series.errors'
import { SeriesRepository } from '../series.repo'
import { requireAssignedEditor } from './series-editor.guard'
import { SeriesStateService } from './series-state.service'

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/

@Injectable()
export class SeriesLifecycleService {
  private readonly logger = new Logger(SeriesLifecycleService.name)

  constructor(
    private readonly seriesStateService: SeriesStateService,
    private readonly seriesRepository: SeriesRepository,
    private readonly eventBus: DomainEventBus,
    private readonly notificationService: NotificationService
  ) {}

  private async notifyOwners(
    series: { mangakaId?: string | null; editorId?: string | null },
    referenceType: string,
    content: string,
    seriesId: string
  ) {
    await Promise.all(
      [series.mangakaId, series.editorId]
        .filter((id): id is string => !!id)
        .map((recipientId) =>
          this.notificationService.notifySafe({
            recipientId,
            type: NotificationType.SYSTEM,
            referenceId: seriesId,
            referenceType,
            content
          })
        )
    )
  }

  // Called by listener (system, changedBy=null) when Board APPROVED CANCELLATION.
  async cancel(seriesId: string, endingChapterAllowance?: number) {
    const allowance = endingChapterAllowance ?? null
    const series = await this.seriesStateService.transition(seriesId, SeriesStatus.CANCELLING, { changedBy: null })
    await this.seriesRepository.setEndingChapterAllowance(seriesId, allowance)
    this.eventBus.emit(DomainEvent.SeriesCancelling, { seriesId })
    await this.notifyOwners(
      series,
      'SERIES_CANCELLING',
      SeriesMessages.notification.seriesCancelling(allowance),
      seriesId
    )
    return series
  }

  // Called by listener when Board APPROVED COMPLETION.
  async complete(seriesId: string) {
    const series = await this.seriesStateService.transition(seriesId, SeriesStatus.COMPLETING, { changedBy: null })
    await this.notifyOwners(series, 'SERIES_COMPLETING', SeriesMessages.notification.seriesCompleting, seriesId)
    return series
  }

  // Called by listener when Board APPROVED FORMAT_CHANGE. Only changes publicationType, NO status transition.
  // Contract Amendment deferred to Spec 3.
  async changeFormat(seriesId: string, publicationType?: PublicationType) {
    if (!publicationType) {
      this.logger.warn(`FORMAT_CHANGE for series ${seriesId} without publicationType in details — skipped.`)
      return
    }
    await this.seriesRepository.updatePublicationType(seriesId, publicationType)
    const series = await this.seriesRepository.findById(seriesId)
    if (series)
      await this.notifyOwners(
        series,
        'SERIES_FORMAT_CHANGED',
        SeriesMessages.notification.seriesFormatChanged,
        seriesId
      )
  }

  // Editor-driven. Guard assigned editor + SERIALIZED (transition table enforces).
  async hiatus(seriesId: string, actorId: string, reason: string, expectedReturnDate?: string) {
    if (!OBJECT_ID_RE.test(seriesId)) throw SeriesNotFoundException
    const current = await this.seriesRepository.findById(seriesId)
    if (!current) throw SeriesNotFoundException
    requireAssignedEditor(current, actorId)
    const fullReason = expectedReturnDate ? `${reason} (expected return: ${expectedReturnDate})` : reason
    const series = await this.seriesStateService.transition(seriesId, SeriesStatus.HIATUS, {
      changedBy: actorId,
      reason: fullReason
    })
    await this.seriesRepository.setHiatusStartedAt(seriesId, new Date())
    this.eventBus.emit(DomainEvent.SeriesHiatusStarted, { seriesId })
    await this.notifyOwners(series, 'SERIES_HIATUS_STARTED', SeriesMessages.notification.seriesHiatusStarted, seriesId)
    return series
  }

  async resume(seriesId: string, actorId: string) {
    if (!OBJECT_ID_RE.test(seriesId)) throw SeriesNotFoundException
    const current = await this.seriesRepository.findById(seriesId)
    if (!current) throw SeriesNotFoundException
    requireAssignedEditor(current, actorId)
    let pausedMs = 0
    if (current.hiatusStartedAt) pausedMs = Date.now() - new Date(current.hiatusStartedAt).getTime()
    else this.logger.warn(`Series ${seriesId} resume without hiatusStartedAt — pausedMs=0.`)
    const series = await this.seriesStateService.transition(seriesId, SeriesStatus.SERIALIZED, { changedBy: actorId })
    await this.seriesRepository.setHiatusStartedAt(seriesId, null)
    this.eventBus.emit(DomainEvent.SeriesHiatusEnded, { seriesId, pausedMs })
    await this.notifyOwners(series, 'SERIES_RESUMED', SeriesMessages.notification.seriesResumed, seriesId)
    return series
  }

  // Editor manually closes: CANCELLING→CANCELLED / COMPLETING→COMPLETED.
  async finalizeEnding(seriesId: string, actorId: string) {
    if (!OBJECT_ID_RE.test(seriesId)) throw SeriesNotFoundException
    const current = await this.seriesRepository.findById(seriesId)
    if (!current) throw SeriesNotFoundException
    requireAssignedEditor(current, actorId)
    if (current.status === SeriesStatus.CANCELLING) {
      const series = await this.seriesStateService.transition(seriesId, SeriesStatus.CANCELLED, { changedBy: actorId })
      this.eventBus.emit(DomainEvent.SeriesCancelled, { seriesId })
      await this.notifyOwners(series, 'SERIES_CANCELLED', SeriesMessages.notification.seriesCancelled, seriesId)
      return series
    }
    if (current.status === SeriesStatus.COMPLETING) {
      const series = await this.seriesStateService.transition(seriesId, SeriesStatus.COMPLETED, { changedBy: actorId })
      await this.notifyOwners(series, 'SERIES_COMPLETED', SeriesMessages.notification.seriesCompleted, seriesId)
      return series
    }
    throw SeriesNotInEndingStateException
  }
}
