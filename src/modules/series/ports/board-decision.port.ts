// B5-INTEGRATION: hợp đồng A2 cần từ Board engine (BE-B / B5).
// Chưa có implementation. Khi B5 sẵn sàng: SeriesPitchService gọi openSerializationDecision khi pitch;
// nhận event Board APPROVE -> transition PITCHED->SERIALIZED + emit DomainEvent.SeriesSerialized;
// REJECT -> PITCHED->REJECTED.
export interface BoardDecisionPort {
  openSerializationDecision(input: { seriesId: string; editorId: string }): Promise<void>
}
