import { DeadlineRequest } from '@prisma/client'
import { DeadlineRequestResType } from './schemas/deadline-schemas'
import { ChapterMiniType, SeriesMiniType } from 'src/core/models/user-mini.model'

const iso = (date: Date | null | undefined) => (date ? date.toISOString() : null)

type DeadlineRequestWithContext = DeadlineRequest & {
  series?: SeriesMiniType | null
  chapter?: ChapterMiniType | null
}

export function toDeadlineRequestRes(deadlineRequest: DeadlineRequestWithContext): DeadlineRequestResType {
  return {
    id: deadlineRequest.id,
    scheduleId: deadlineRequest.scheduleId,
    chapterId: deadlineRequest.chapterId,
    seriesId: deadlineRequest.seriesId,
    requestedBy: deadlineRequest.requestedBy,
    lastProposedBy: deadlineRequest.lastProposedBy,
    currentDeadline: iso(deadlineRequest.currentDeadline),
    requestedDeadline: iso(deadlineRequest.requestedDeadline),
    reason: deadlineRequest.reason,
    affectsSlot: deadlineRequest.affectsSlot,
    status: deadlineRequest.status,
    boardReviewedBy: deadlineRequest.boardReviewedBy,
    resolvedAt: iso(deadlineRequest.resolvedAt),
    createdAt: deadlineRequest.createdAt.toISOString(),
    ...(deadlineRequest.series !== undefined ? { series: deadlineRequest.series } : {}),
    ...(deadlineRequest.chapter !== undefined ? { chapter: deadlineRequest.chapter } : {})
  }
}
