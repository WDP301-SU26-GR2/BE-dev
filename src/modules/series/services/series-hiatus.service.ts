import { Injectable, Logger } from '@nestjs/common'
import { isObjectId } from 'src/core/http/schemas/object-id.schema'
import { SeriesStatus } from '@prisma/client'
import { DomainEvent } from 'src/core/events/domain-events'
import { DomainEventBus } from 'src/core/events/domain-event-bus.service'
import { ChapterHiatusCascadeService } from 'src/modules/chapter/services/chapter-hiatus-cascade.service'
import { SeriesMessages } from '../series.messages'
import { SeriesNotFoundException } from '../errors/series.errors'
import { SeriesRepository } from '../series.repo'
import { requireAssignedEditor } from './series-editor.guard'
import { SeriesStateService } from './series-state.service'
import { SeriesLifecycleNotificationService } from './series-lifecycle-notification.service'

@Injectable()
export class SeriesHiatusService {
  private readonly logger = new Logger(SeriesHiatusService.name)

  constructor(
    private readonly seriesStateService: SeriesStateService,
    private readonly seriesRepository: SeriesRepository,
    private readonly lifecycleNotifications: SeriesLifecycleNotificationService,
    private readonly cascadeService: ChapterHiatusCascadeService,
    private readonly eventBus: DomainEventBus
  ) {}

  async hiatus(seriesId: string, actorId: string, reason: string, expectedReturnDate?: string) {
    if (!isObjectId(seriesId)) throw SeriesNotFoundException
    const current = await this.seriesRepository.findById(seriesId)
    if (!current) throw SeriesNotFoundException
    requireAssignedEditor(current, actorId)
    const series = await this.seriesStateService.transition(seriesId, SeriesStatus.HIATUS, {
      changedBy: actorId,
      reason
    })
    await this.seriesRepository.setHiatusStart(
      seriesId,
      new Date(),
      expectedReturnDate ? new Date(expectedReturnDate) : null
    )
    await this.cascadeService.holdAllForHiatus(seriesId, actorId, SeriesMessages.reason.hiatusHold)
    this.eventBus.emit(DomainEvent.SeriesHiatusStarted, { seriesId })
    await this.lifecycleNotifications.notifyOwnersAndAssistants(
      series,
      'SERIES_HIATUS_STARTED',
      SeriesMessages.notification.seriesHiatusStarted,
      seriesId
    )
    return series
  }

  async resume(seriesId: string, actorId: string) {
    if (!isObjectId(seriesId)) throw SeriesNotFoundException
    const current = await this.seriesRepository.findById(seriesId)
    if (!current) throw SeriesNotFoundException
    requireAssignedEditor(current, actorId)
    let pausedMs = 0
    if (current.hiatusStartedAt) pausedMs = Date.now() - new Date(current.hiatusStartedAt).getTime()
    else this.logger.warn(`Series ${seriesId} resume without hiatusStartedAt — pausedMs=0.`)
    const series = await this.seriesStateService.transition(seriesId, SeriesStatus.SERIALIZED, { changedBy: actorId })
    await this.seriesRepository.clearHiatus(seriesId)
    await this.cascadeService.releaseAllForResume(seriesId, actorId, pausedMs)
    this.eventBus.emit(DomainEvent.SeriesHiatusEnded, { seriesId, pausedMs })
    await this.lifecycleNotifications.notifyOwnersAndAssistants(
      series,
      'SERIES_RESUMED',
      SeriesMessages.notification.seriesResumed,
      seriesId
    )
    return series
  }
}
