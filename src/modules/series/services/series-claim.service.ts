import { Injectable } from '@nestjs/common'
import { isObjectId } from 'src/core/http/schemas/object-id.schema'
import { AuditEntityType } from '@prisma/client'
import { AuditService } from 'src/modules/audit/audit.service'
import {
  NotAssignedEditorException,
  ReviewAlreadyStartedException,
  SeriesAlreadyClaimedException,
  SeriesNotFoundException
} from '../errors/series.errors'
import { toSeriesRes } from '../series.mapper'
import { SeriesRepository } from '../series.repo'

@Injectable()
export class SeriesClaimService {
  constructor(
    private readonly seriesRepository: SeriesRepository,
    private readonly auditService: AuditService
  ) {}

  async claim(editorId: string, seriesId: string) {
    if (!isObjectId(seriesId)) throw SeriesNotFoundException
    const count = await this.seriesRepository.claimSeries(seriesId, editorId)
    if (count === 0) {
      const series = await this.seriesRepository.findById(seriesId)
      if (!series) throw SeriesNotFoundException
      throw SeriesAlreadyClaimedException
    }

    const updated = await this.seriesRepository.findById(seriesId)
    if (!updated) throw SeriesNotFoundException
    await this.auditService.record({
      actorId: editorId,
      entityType: AuditEntityType.SERIES,
      entityId: seriesId,
      action: 'CLAIM'
    })
    return toSeriesRes(updated)
  }

  async release(editorId: string, seriesId: string) {
    if (!isObjectId(seriesId)) throw SeriesNotFoundException
    const count = await this.seriesRepository.releaseSeries(seriesId, editorId)
    if (count === 0) {
      const series = await this.seriesRepository.findById(seriesId)
      if (!series) throw SeriesNotFoundException
      if (series.editorId !== editorId) throw NotAssignedEditorException
      throw ReviewAlreadyStartedException
    }

    const updated = await this.seriesRepository.findById(seriesId)
    if (!updated) throw SeriesNotFoundException
    await this.auditService.record({
      actorId: editorId,
      entityType: AuditEntityType.SERIES,
      entityId: seriesId,
      action: 'RELEASE'
    })
    return toSeriesRes(updated)
  }
}
