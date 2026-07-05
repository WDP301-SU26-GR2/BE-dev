import { Injectable, Logger } from '@nestjs/common'
import { AuditEntityType } from '@prisma/client'
import { toAuditLogRes } from './audit.mapper'
import { AuditListWhere, AuditRepository } from './audit.repo'
import { ListAuditLogsQueryType } from './schemas/audit-schemas'

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/

export interface RecordAuditLogInput {
  actorId: string | null
  entityType: AuditEntityType
  entityId: string
  action: string
  fromState?: string
  toState?: string
  reason?: string
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name)

  constructor(private readonly auditRepository: AuditRepository) {}

  async record(input: RecordAuditLogInput): Promise<void> {
    try {
      if (!OBJECT_ID_RE.test(input.entityId)) {
        this.logger.warn(`audit skipped: malformed entityId "${input.entityId}" (${input.entityType}/${input.action})`)
        return
      }
      await this.auditRepository.create({
        actorId: input.actorId,
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        fromState: input.fromState ?? null,
        toState: input.toState ?? null,
        reason: input.reason ?? null
      })
    } catch (error) {
      this.logger.error(`audit record failed (${input.entityType}/${input.action}): ${String(error)}`)
    }
  }

  async query(query: ListAuditLogsQueryType) {
    const emptyResult = { items: [], total: 0, limit: query.limit, offset: query.offset }
    if (query.entityId && !OBJECT_ID_RE.test(query.entityId)) return emptyResult
    if (query.actorId && !OBJECT_ID_RE.test(query.actorId)) return emptyResult

    const where: AuditListWhere = {
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(query.actorId ? { actorId: query.actorId } : {}),
      ...(query.action ? { action: query.action } : {})
    }
    const page = { limit: query.limit, offset: query.offset }
    const [rows, total] = await Promise.all([
      this.auditRepository.findMany(where, page),
      this.auditRepository.count(where)
    ])
    return { items: rows.map(toAuditLogRes), total, limit: query.limit, offset: query.offset }
  }
}
