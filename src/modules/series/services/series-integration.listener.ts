import { Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { NotificationType, PublicationType, SeriesStatus } from '@prisma/client'
import { DomainEvent, DomainEventPayload } from 'src/core/events/domain-events'
import { NotificationService } from 'src/modules/notification/notification.service'
import { SeriesMessages } from '../series.messages'
import { SeriesRepository } from '../series.repo'
import { SeriesLifecycleService } from './series-lifecycle.service'
import { SeriesSerializeService } from './series-serialize.service'
import { SeriesStateService } from './series-state.service'

// Spec 2 / Flow 5: integration boundary BE-A ↔ BE-B (Board decision engine B5).
// Lắng nghe BoardDecisionFinalized (BE-B emit) → điều phối lifecycle tương ứng:
//   - SERIALIZATION + APPROVED: SeriesSerializeService.serialize (PITCHED -> SERIALIZED + emit SeriesSerialized)
//   - SERIALIZATION + REJECTED:  SeriesStateService.transition -> REJECTED + notify owners
//   - CANCELLATION + APPROVED:  SeriesLifecycleService.cancel (CANCELLING + emit SeriesCancelling)
//   - COMPLETION   + APPROVED:  SeriesLifecycleService.complete (COMPLETING)
//   - FORMAT_CHANGE + APPROVED: SeriesLifecycleService.changeFormat (no status transition; chỉ đổi publicationType)
// Best-effort: outer try/catch nuốt lỗi + log, KHÔNG throw — mirror notifySafe / audit.record.
@Injectable()
export class SeriesIntegrationListener {
  private readonly logger = new Logger(SeriesIntegrationListener.name)

  constructor(
    private readonly seriesSerializeService: SeriesSerializeService,
    private readonly seriesStateService: SeriesStateService,
    private readonly seriesRepository: SeriesRepository,
    private readonly notificationService: NotificationService,
    private readonly lifecycleService: SeriesLifecycleService
  ) {}

  @OnEvent(DomainEvent.BoardDecisionFinalized)
  async onBoardDecisionFinalized(
    payload: DomainEventPayload[typeof DomainEvent.BoardDecisionFinalized]
  ): Promise<void> {
    if (!payload.targetSeriesId) return
    const seriesId = payload.targetSeriesId
    try {
      switch (payload.decisionType) {
        case 'SERIALIZATION':
          if (payload.result === 'APPROVED') {
            await this.seriesSerializeService.serialize(seriesId, this.readSlot(payload.details))
          } else {
            await this.seriesStateService.transition(seriesId, SeriesStatus.REJECTED, {
              changedBy: null,
              reason: 'Board rejected serialization'
            })
            await this.notifyRejected(seriesId)
          }
          return
        case 'CANCELLATION':
          if (payload.result === 'APPROVED')
            await this.lifecycleService.cancel(seriesId, this.readEndingAllowance(payload.details))
          return
        case 'COMPLETION':
          if (payload.result === 'APPROVED') await this.lifecycleService.complete(seriesId)
          return
        case 'FORMAT_CHANGE':
          if (payload.result === 'APPROVED')
            await this.lifecycleService.changeFormat(seriesId, this.readPublicationType(payload.details))
          return
        default:
          return
      }
    } catch (e) {
      this.logger.warn(`onBoardDecisionFinalized failed for series ${seriesId}: ${(e as Error).message}`)
    }
  }

  // B1 (Contract) integration: B1 emit ContractExecuted → A2 đánh dấu contract đã executed.
  // Gate cho chapter publish (A-CHP-05) sẽ tra cứu Contract.status, không phụ thuộc flag ở Series.
  @OnEvent(DomainEvent.ContractExecuted)
  async onContractExecuted(payload: DomainEventPayload[typeof DomainEvent.ContractExecuted]): Promise<void> {
    try {
      await Promise.resolve(this.seriesRepository.setExecutedContract(payload.seriesId, payload.contractId))
    } catch (e) {
      this.logger.warn(
        `onContractExecuted failed for series ${payload.seriesId} / contract ${payload.contractId}: ${(e as Error).message}`
      )
    }
  }

  private readEndingAllowance(details: Record<string, unknown> | null): number | undefined {
    const v = details?.endingChapterAllowance
    return typeof v === 'number' && v > 0 ? v : undefined
  }

  private readPublicationType(details: Record<string, unknown> | null): PublicationType | undefined {
    const v = details?.publicationType
    return v === 'WEEKLY' || v === 'MONTHLY' || v === 'IRREGULAR' ? v : undefined
  }

  private readSlot(details: Record<string, unknown> | null): {
    magazine: string
    startIssueNumber: number
    publicationType: string
  } {
    const magazine = typeof details?.magazine === 'string' ? details.magazine : ''
    const startIssueNumber = typeof details?.startIssueNumber === 'number' ? details.startIssueNumber : 0
    const publicationTypeRaw = details?.publicationType
    const publicationType =
      publicationTypeRaw === 'WEEKLY' || publicationTypeRaw === 'MONTHLY' || publicationTypeRaw === 'IRREGULAR'
        ? (publicationTypeRaw as string)
        : 'WEEKLY'
    return { magazine, startIssueNumber, publicationType }
  }

  private async notifyRejected(seriesId: string): Promise<void> {
    const series = await this.seriesRepository.findById(seriesId)
    if (!series) return
    const recipients = [series.mangakaId, series.editorId].filter((id): id is string => !!id)
    for (const recipientId of recipients) {
      await this.notificationService.notifySafe({
        recipientId,
        type: NotificationType.SYSTEM,
        referenceId: seriesId,
        referenceType: 'SERIES_REJECTED',
        content: SeriesMessages.notification.seriesRejected
      })
    }
  }
}
