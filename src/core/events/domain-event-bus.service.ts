import { Injectable } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { DomainEventName, DomainEventPayload } from './domain-events'

/**
 * Typed facade over EventEmitter2 for domain events (S0-3).
 *
 * Emit:    domainEventBus.emit(DomainEvent.ChapterPublished, { chapterId, seriesId, publishedAt })
 * Listen:  @OnEvent(DomainEvent.ChapterPublished)
 *          handle(payload: DomainEventPayload['chapter.published']) { ... }
 *
 * In-process only (same Nest app). If a module ever splits into its own service,
 * swap this implementation for a transport-backed emitter — consumers stay unchanged.
 */
@Injectable()
export class DomainEventBus {
  constructor(private readonly emitter: EventEmitter2) {}

  emit<E extends DomainEventName>(event: E, payload: DomainEventPayload[E]): void {
    this.emitter.emit(event, payload)
  }

  /** Await all async listeners (use when the caller needs listeners to finish). */
  async emitAsync<E extends DomainEventName>(event: E, payload: DomainEventPayload[E]): Promise<void> {
    await this.emitter.emitAsync(event, payload)
  }
}
