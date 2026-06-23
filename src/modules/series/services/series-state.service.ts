import { Injectable } from '@nestjs/common'
import { NameStatus, ProposalStatus, SeriesStatus } from '@prisma/client'
import { SERIES_TRANSITIONS } from '../series.constant'
import { InvalidSeriesTransitionException, SeriesNotFoundException } from '../errors/series.errors'
import { SeriesRepository } from '../series.repo'

@Injectable()
export class SeriesStateService {
  constructor(private readonly seriesRepository: SeriesRepository) {}

  async transition(seriesId: string, toStatus: SeriesStatus, opts: { changedBy: string; reason?: string }) {
    const series = await this.seriesRepository.findById(seriesId)
    if (!series) throw SeriesNotFoundException
    const from = series.status
    const allowed = SERIES_TRANSITIONS[from] ?? []
    if (!allowed.includes(toStatus)) throw InvalidSeriesTransitionException
    return await this.seriesRepository.updateStatusWithHistory(seriesId, {
      fromStatus: from,
      toStatus,
      changedBy: opts.changedBy,
      reason: opts.reason
    })
  }

  async tryAdvanceToReadyToPitch(seriesId: string, changedBy: string) {
    const series = await this.seriesRepository.findById(seriesId)
    if (!series) throw SeriesNotFoundException
    if (series.status !== SeriesStatus.IN_REVIEW) return series
    if (series.proposal?.status !== ProposalStatus.PROPOSAL_APPROVED) return series
    const nameId = series.proposal?.nameId
    if (!nameId) return series
    const name = await this.seriesRepository.findNameById(nameId)
    if (!name || name.status !== NameStatus.APPROVED) return series
    return await this.transition(seriesId, SeriesStatus.READY_TO_PITCH, { changedBy })
  }
}
