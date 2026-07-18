import { RevisionRequest } from '@prisma/client'
import { RevisionRequestResType } from './schemas/revision-schemas'
import { SeriesMiniType, UserMiniType } from 'src/core/models/user-mini.model'

type RevisionRequestWithContext = RevisionRequest & {
  requester?: UserMiniType | null
  recipient?: UserMiniType | null
  series?: SeriesMiniType | null
}

export function toRevisionRequestRes(row: RevisionRequestWithContext): RevisionRequestResType {
  return {
    id: row.id,
    targetType: row.targetType,
    targetId: row.targetId,
    seriesId: row.seriesId,
    round: row.round,
    reason: row.reason,
    requestedBy: row.requestedBy,
    recipientId: row.recipientId,
    isResolved: row.isResolved,
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
    resolvedBy: row.resolvedBy,
    createdAt: row.createdAt.toISOString(),
    ...(row.requester !== undefined ? { requester: row.requester } : {}),
    ...(row.recipient !== undefined ? { recipient: row.recipient } : {}),
    ...(row.series !== undefined ? { series: row.series } : {})
  }
}
