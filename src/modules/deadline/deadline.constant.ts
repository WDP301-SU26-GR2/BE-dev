import { DeadlineRequestStatus } from '@prisma/client'

export type DeadlineSide = 'MANGAKA' | 'EDITOR'

export function resolveSide(
  userId: string,
  series: { mangakaId: string; editorId: string | null }
): DeadlineSide | null {
  if (series.mangakaId === userId) return 'MANGAKA'
  if (series.editorId && series.editorId === userId) return 'EDITOR'
  return null
}

export const DEADLINE_REQUEST_TRANSITIONS: Record<DeadlineRequestStatus, DeadlineRequestStatus[]> = {
  [DeadlineRequestStatus.PROPOSED]: [
    DeadlineRequestStatus.COUNTER_PROPOSED,
    DeadlineRequestStatus.AGREED_BY_PARTIES,
    DeadlineRequestStatus.ESCALATED,
    DeadlineRequestStatus.REJECTED
  ],
  [DeadlineRequestStatus.COUNTER_PROPOSED]: [
    DeadlineRequestStatus.COUNTER_PROPOSED,
    DeadlineRequestStatus.AGREED_BY_PARTIES,
    DeadlineRequestStatus.ESCALATED,
    DeadlineRequestStatus.REJECTED
  ],
  [DeadlineRequestStatus.AGREED_BY_PARTIES]: [DeadlineRequestStatus.APPROVED, DeadlineRequestStatus.BOARD_REVIEW],
  [DeadlineRequestStatus.BOARD_REVIEW]: [DeadlineRequestStatus.APPROVED, DeadlineRequestStatus.REJECTED],
  [DeadlineRequestStatus.ESCALATED]: [DeadlineRequestStatus.APPROVED, DeadlineRequestStatus.REJECTED],
  [DeadlineRequestStatus.APPROVED]: [],
  [DeadlineRequestStatus.REJECTED]: []
}

export const DEADLINE_RESOLVED_STATES: ReadonlySet<DeadlineRequestStatus> = new Set([
  DeadlineRequestStatus.APPROVED,
  DeadlineRequestStatus.REJECTED,
  DeadlineRequestStatus.ESCALATED,
  DeadlineRequestStatus.BOARD_REVIEW
])

export const DEADLINE_CLOSED_STATES: DeadlineRequestStatus[] = [
  DeadlineRequestStatus.APPROVED,
  DeadlineRequestStatus.REJECTED
]

export function computeAffectsSlot(currentDeadline: Date | null, requestedDeadline: Date, graceHours: number): boolean {
  if (!currentDeadline) return false
  return requestedDeadline.getTime() - currentDeadline.getTime() > graceHours * 3600_000
}
