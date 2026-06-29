// ============================================================================
// Domain Event Contract (Sprint 0 — S0-3 / S0-6)
// Shared between BE-A (Creation & Production) and BE-B (Commercial & Governance).
// In-process events via @nestjs/event-emitter. Emit with DomainEventBus,
// listen with @OnEvent(DomainEvent.X). Keep names/payloads in sync across both BEs.
// ============================================================================

export const DomainEvent = {
  // Emitted by BE-A
  SeriesSerialized: 'series.serialized', // A2 → B1 (khởi tạo Contract)
  ChapterPublished: 'chapter.published', // A-CHP-05 → B-CON-05 (payment), B4 (ranking)
  AssistantAvailabilityChanged: 'assistant.availability.changed', // A-TSK-05 (users → task: leave → ON_HOLD)

  // Emitted by BE-B
  ContractExecuted: 'contract.executed', // B1 → A2 (sequel), A-CHP-05 (publish gate)
  RankingFinalized: 'ranking.finalized', // B4 → B-CON-05, B5
  SeriesCancelling: 'series.cancelling', // B5 → B-CON-09 (termination/compensation)
  SeriesCancelled: 'series.cancelled' // B5 → A/B (sau khi hết ending chapters)
} as const

export type DomainEventName = (typeof DomainEvent)[keyof typeof DomainEvent]

// Payload mỗi event. Khi đổi → cập nhật cả 2 phía emit/listen.
export interface DomainEventPayload {
  [DomainEvent.SeriesSerialized]: { seriesId: string }
  [DomainEvent.ChapterPublished]: { chapterId: string; seriesId: string; publishedAt: string }
  [DomainEvent.AssistantAvailabilityChanged]: { assistantId: string; availabilityStatus: string }
  [DomainEvent.ContractExecuted]: { contractId: string; seriesId: string }
  [DomainEvent.RankingFinalized]: { surveyPeriodId: string }
  [DomainEvent.SeriesCancelling]: { seriesId: string; endingChapterAllowance: number }
  [DomainEvent.SeriesCancelled]: { seriesId: string }
}
