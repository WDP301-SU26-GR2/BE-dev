import { Injectable } from '@nestjs/common'
import { AuditEntityType, Prisma, SeriesRequestStatus } from '@prisma/client'
import { AuditService } from 'src/modules/audit/audit.service'
import {
  InvalidSeriesRequestTransitionException,
  SeriesRequestNotFoundException
} from '../errors/series-request.errors'
import { SERIES_REQUEST_TRANSITIONS } from '../series-request.constant'
import { SeriesRequestRepository } from '../series-request.repo'

// Single-writer cho state machine SeriesRequest (AGENTS §9).
@Injectable()
export class SeriesRequestStateService {
  constructor(
    private readonly repository: SeriesRequestRepository,
    private readonly auditService: AuditService
  ) {}

  async transition(
    id: string,
    to: SeriesRequestStatus,
    opts: { by: string; reason?: string | null; extra?: Prisma.SeriesRequestUpdateInput }
  ) {
    const request = await this.repository.findById(id)
    if (!request) throw SeriesRequestNotFoundException
    const from = request.status
    const allowed = SERIES_REQUEST_TRANSITIONS[from] ?? []
    if (!allowed.includes(to)) throw InvalidSeriesRequestTransitionException
    const updated = await this.repository.applyTransition(id, {
      from,
      to,
      by: opts.by,
      reason: opts.reason,
      extra: opts.extra
    })
    // Audit best-effort, SAU khi ghi DB chính (AGENTS §8).
    await this.auditService.record({
      actorId: opts.by,
      entityType: AuditEntityType.SERIES,
      entityId: request.seriesId,
      action: `SERIES_REQUEST_${to}`,
      fromState: from,
      toState: to,
      reason: opts.reason ?? undefined
    })
    return updated
  }
}
