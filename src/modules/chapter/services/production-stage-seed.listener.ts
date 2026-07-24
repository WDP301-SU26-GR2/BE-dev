import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { DomainEvent, DomainEventPayload } from 'src/core/events/domain-events'
import { ProductionStageStateService } from './production-stage-state.service'

@Injectable()
export class ProductionStageSeedListener {
  constructor(private readonly stageStateService: ProductionStageStateService) {}

  @OnEvent(DomainEvent.NameApproved)
  async handle(payload: DomainEventPayload[typeof DomainEvent.NameApproved]): Promise<void> {
    if (payload.kind !== 'CHAPTER' || !payload.chapterId) return
    await this.stageStateService.seedForChapter(payload.chapterId)
  }
}
