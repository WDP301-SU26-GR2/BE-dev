import { AuditLog } from '@prisma/client'
import { AuditLogResType } from './schemas/audit-schemas'

export function toAuditLogRes(row: AuditLog): AuditLogResType {
  return {
    id: row.id,
    actorId: row.actorId,
    entityType: row.entityType,
    entityId: row.entityId,
    action: row.action,
    fromState: row.fromState,
    toState: row.toState,
    reason: row.reason,
    createdAt: row.createdAt.toISOString()
  }
}
