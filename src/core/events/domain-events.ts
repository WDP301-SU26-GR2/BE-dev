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
  SeriesHiatusStarted: 'series.hiatus.started', // Spec 2: BE-A → BE-B (pause TIME_BOUND)
  SeriesHiatusEnded: 'series.hiatus.ended', // Spec 2: BE-A → BE-B (resume + shift deadline)

  // Emitted by BE-B
  ContractExecuted: 'contract.executed', // B1 → A2 (sequel), A-CHP-05 (publish gate)
  RankingFinalized: 'ranking.finalized', // B4 → B-CON-05, B5
  SeriesCancelling: 'series.cancelling', // B5 → B-CON-09 (termination/compensation)
  SeriesCancelled: 'series.cancelled', // B5 → A/B (sau khi hết ending chapters)
  BoardDecisionFinalized: 'board.decision.finalized', // B5 → A2 (Flow 5: CANCELLATION/COMPLETION/FORMAT_CHANGE/SERIALIZATION outcomes)
  RevenueReported: 'contract.revenue_reported' // B-CON-07: contract → payment (chia revenue-share)
} as const

export type DomainEventName = (typeof DomainEvent)[keyof typeof DomainEvent]

// Payload mỗi event. Khi đổi → cập nhật cả 2 phía emit/listen.
export interface DomainEventPayload {
  [DomainEvent.SeriesSerialized]: { seriesId: string }
  [DomainEvent.ChapterPublished]: { chapterId: string; seriesId: string; chapterNumber: number; publishedAt: string }
  [DomainEvent.AssistantAvailabilityChanged]: { assistantId: string; availabilityStatus: string }
  [DomainEvent.SeriesHiatusStarted]: { seriesId: string }
  [DomainEvent.SeriesHiatusEnded]: { seriesId: string; pausedMs: number }
  [DomainEvent.ContractExecuted]: { contractId: string; seriesId: string }
  [DomainEvent.RankingFinalized]: { surveyPeriodId: string; rankings: Array<{ seriesId: string; rank: number }> }
  [DomainEvent.SeriesCancelling]: { seriesId: string }
  [DomainEvent.SeriesCancelled]: { seriesId: string }
  [DomainEvent.RevenueReported]: { contractId: string; revenue: number; period: string }
  [DomainEvent.BoardDecisionFinalized]: {
    decisionId: string
    decisionType: 'SERIALIZATION' | 'CANCELLATION' | 'COMPLETION' | 'FORMAT_CHANGE' | 'CONTINUE'
    targetSeriesId: string | null
    result: 'APPROVED' | 'REJECTED'
    details: Record<string, unknown> | null
  }
}
