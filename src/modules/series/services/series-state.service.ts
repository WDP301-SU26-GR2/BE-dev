import { Injectable } from '@nestjs/common'
import { AuditEntityType, SeriesStatus } from '@prisma/client'
import { AuditService } from 'src/modules/audit/audit.service'
import { SERIES_TRANSITIONS } from '../series.constant'
import { InvalidSeriesTransitionException, SeriesNotFoundException } from '../errors/series.errors'
import { SeriesRepository } from '../series.repo'
import { CacheService } from 'src/infrastructure/redis/cache.service'

@Injectable()
export class SeriesStateService {
  constructor(
    private readonly seriesRepository: SeriesRepository,
    private readonly auditService: AuditService,
    private readonly cacheService: CacheService
  ) {}

  async transition(seriesId: string, toStatus: SeriesStatus, opts: { changedBy: string | null; reason?: string }) {
    const series = await this.seriesRepository.findById(seriesId)
    if (!series) throw SeriesNotFoundException
    const from = series.status
    const allowed = SERIES_TRANSITIONS[from] ?? []
    if (!allowed.includes(toStatus)) throw InvalidSeriesTransitionException
    const updated = await this.seriesRepository.updateStatusWithHistory(seriesId, {
      fromStatus: from,
      toStatus,
      changedBy: opts.changedBy,
      reason: opts.reason
    })
    await this.auditService.record({
      actorId: opts.changedBy,
      entityType: AuditEntityType.SERIES,
      entityId: seriesId,
      action: 'TRANSITION',
      fromState: from,
      toState: toStatus,
      reason: opts.reason
    })
    await this.cacheService.bumpVersion('pubseries')
    await this.cacheService.bumpVersion('votectx')
    return updated
  }
}
