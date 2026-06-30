// B5-INTEGRATION: boundary for wiring Deadline escalation to Board engine later.
// No implementation is registered in A5; ESCALATED/BOARD_REVIEW are BE-A handoff states.
export interface BoardEscalationInput {
  kind: 'DEADLINE_DISPUTE' | 'DEADLINE_SLOT'
  deadlineRequestId: string
  seriesId: string | null
  chapterId: string | null
  reason: string | null
}

export interface BoardEscalationPort {
  escalate(input: BoardEscalationInput): Promise<void>
}
