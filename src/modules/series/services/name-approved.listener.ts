import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { DomainEvent, DomainEventPayload } from 'src/core/events/domain-events'
import { SeriesRepository } from '../series.repo'
import { SeriesStateService } from './series-state.service'

// Spec 8 §6: Name module emit NameApproved SAU commit. Series module lắng nghe và advance
// READY_TO_PITCH nếu kind=PROPOSAL. kind=CHAPTER → no-op (chapter-Name approve KHÔNG đụng
// Series status). Lưu ý: editorId resolve từ Series (đọc trong series module) thay vì truyền
// qua payload — vì advance là hành động phía series (xem spec §6 lưu ý editorId).
@Injectable()
export class NameApprovedListener {
  constructor(
    private readonly seriesRepository: SeriesRepository,
    private readonly seriesStateService: SeriesStateService
  ) {}

  @OnEvent(DomainEvent.NameApproved)
  async handle(payload: DomainEventPayload[typeof DomainEvent.NameApproved]): Promise<void> {
    if (payload.kind !== 'PROPOSAL') return
    const series = await this.seriesRepository.findById(payload.seriesId)
    if (!series?.editorId) return
    await this.seriesStateService.tryAdvanceToReadyToPitch(payload.seriesId, series.editorId)
  }
}
