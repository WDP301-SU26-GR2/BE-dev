import { Injectable } from '@nestjs/common'
import { ProposalStatus, SeriesStatus } from '@prisma/client'
import { SeriesNotFoundException, SeriesNotReadyToPitchException } from '../errors/series.errors'
import { toSeriesRes } from '../series.mapper'
import { SeriesRepository } from '../series.repo'
import { SeriesStateService } from './series-state.service'
import { requireAssignedEditor } from './series-editor.guard'

@Injectable()
export class SeriesPitchService {
  constructor(
    private readonly seriesRepository: SeriesRepository,
    private readonly seriesStateService: SeriesStateService
  ) {}

  async pitch(editorId: string, seriesId: string) {
    const series = await this.seriesRepository.findById(seriesId)
    if (!series) throw SeriesNotFoundException
    requireAssignedEditor(series, editorId)
    if (series.status !== SeriesStatus.READY_TO_PITCH) throw SeriesNotReadyToPitchException
    await this.seriesRepository.updateProposalStatus(seriesId, ProposalStatus.PITCHED)
    const updated = await this.seriesStateService.transition(seriesId, SeriesStatus.PITCHED, { changedBy: editorId })
    // Serial hoá do Board quyết bất đồng bộ: Editor tạo BoardDecision (SERIALIZATION) → Board vote →
    // BoardDecisionFinalized (BE-B emit) → SeriesIntegrationListener serialize (PITCHED→SERIALIZED). Pitch chỉ set PITCHED.
    return toSeriesRes(updated)
  }
}
