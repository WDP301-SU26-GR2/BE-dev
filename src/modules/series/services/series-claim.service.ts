import { Injectable } from '@nestjs/common'
import {
  NotAssignedEditorException,
  ReviewAlreadyStartedException,
  SeriesAlreadyClaimedException,
  SeriesNotFoundException
} from '../errors/series.errors'
import { toSeriesRes } from '../series.mapper'
import { SeriesRepository } from '../series.repo'

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/

@Injectable()
export class SeriesClaimService {
  constructor(private readonly seriesRepository: SeriesRepository) {}

  async claim(editorId: string, seriesId: string) {
    if (!OBJECT_ID_RE.test(seriesId)) throw SeriesNotFoundException
    const count = await this.seriesRepository.claimSeries(seriesId, editorId)
    if (count === 0) {
      const series = await this.seriesRepository.findById(seriesId)
      if (!series) throw SeriesNotFoundException
      throw SeriesAlreadyClaimedException
    }

    const updated = await this.seriesRepository.findById(seriesId)
    if (!updated) throw SeriesNotFoundException
    return toSeriesRes(updated)
  }

  async release(editorId: string, seriesId: string) {
    if (!OBJECT_ID_RE.test(seriesId)) throw SeriesNotFoundException
    const count = await this.seriesRepository.releaseSeries(seriesId, editorId)
    if (count === 0) {
      const series = await this.seriesRepository.findById(seriesId)
      if (!series) throw SeriesNotFoundException
      if (series.editorId !== editorId) throw NotAssignedEditorException
      throw ReviewAlreadyStartedException
    }

    const updated = await this.seriesRepository.findById(seriesId)
    if (!updated) throw SeriesNotFoundException
    return toSeriesRes(updated)
  }
}
