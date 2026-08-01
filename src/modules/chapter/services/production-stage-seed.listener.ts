import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { DomainEvent, DomainEventPayload } from 'src/core/events/domain-events'
import { ProductionStageStateService } from './production-stage-state.service'

@Injectable()
export class ProductionStageSeedListener {
  constructor(private readonly stageStateService: ProductionStageStateService) {}

  @OnEvent(DomainEvent.StoryboardApproved)
  async handle(payload: DomainEventPayload[typeof DomainEvent.StoryboardApproved]): Promise<void> {
    await this.stageStateService.seedForChapter(payload.chapterId)
  }
}
