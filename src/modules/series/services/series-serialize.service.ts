import { Injectable, Logger } from '@nestjs/common'
import { SeriesStatus } from '@prisma/client'
import { DomainEvent } from 'src/core/events/domain-events'
import { DomainEventBus } from 'src/core/events/domain-event-bus.service'
import { SeriesRepository } from '../series.repo'
import { SeriesStateService } from './series-state.service'

// Spec 2 / Flow 5: thực thi quyết định Board SERIALIZATION.
// B5 mở decision khi editor pitch; khi Board APPROVE -> emit BoardDecisionFinalized
// (decisionType='SERIALIZATION', result='APPROVED', details={ magazine, startIssueNumber, publicationType }).
// Listener gọi service này: PITCHED -> SERIALIZED + set magazine/startIssueNumber/publicationType + emit SeriesSerialized.
// Stub phục vụ tích hợp; contract (setMagazineAndStartIssue / state transition) đã ổn định qua listener test.
// Khi B5 chính thức emit event, behavior đã sẵn sàng — không cần thay đổi DI.
@Injectable()
export class SeriesSerializeService {
  private readonly logger = new Logger(SeriesSerializeService.name)

  constructor(
    private readonly seriesRepository: SeriesRepository,
    private readonly seriesStateService: SeriesStateService,
    private readonly eventBus: DomainEventBus
  ) {}

  async serialize(
    seriesId: string,
    slot: { magazine: string; startIssueNumber: number; publicationType: string }
  ): Promise<void> {
    await this.seriesRepository.updateSerializationSlot(seriesId, slot)
    const series = await this.seriesStateService.transition(seriesId, SeriesStatus.SERIALIZED, { changedBy: null })
    this.eventBus.emit(DomainEvent.SeriesSerialized, { seriesId: series.id })
  }
}
