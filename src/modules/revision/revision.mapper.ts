import { RevisionRequest } from '@prisma/client'
import { RevisionRequestResType } from './schemas/revision-schemas'

export function toRevisionRequestRes(row: RevisionRequest): RevisionRequestResType {
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
    createdAt: row.createdAt.toISOString()
  }
}
