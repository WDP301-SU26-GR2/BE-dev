import { Injectable } from '@nestjs/common'
import { ProposalStatus, SeriesStatus } from '@prisma/client'
import { SeriesNotFoundException, SeriesNotReadyToPitchException } from '../errors/series.errors'
import { toSeriesRes } from '../series.mapper'
import { SeriesRepository } from '../series.repo'
import { SeriesStateService } from './series-state.service'

@Injectable()
export class SeriesPitchService {
  constructor(
    private readonly seriesRepository: SeriesRepository,
    private readonly seriesStateService: SeriesStateService
  ) {}

  async pitch(editorId: string, seriesId: string) {
    const series = await this.seriesRepository.findById(seriesId)
    if (!series) throw SeriesNotFoundException
    if (series.status !== SeriesStatus.READY_TO_PITCH) throw SeriesNotReadyToPitchException
    await this.seriesRepository.updateProposalStatus(seriesId, ProposalStatus.PITCHED)
    const updated = await this.seriesStateService.transition(seriesId, SeriesStatus.PITCHED, { changedBy: editorId })
    // B5-INTEGRATION: gọi BoardDecisionPort.openSerializationDecision({ seriesId, editorId }) khi B5 sẵn sàng.
    //   Board APPROVE -> transition PITCHED->SERIALIZED + domainEventBus.emit(DomainEvent.SeriesSerialized, { seriesId })
    //   Board REJECT  -> transition PITCHED->REJECTED
    //   notify board members: chưa có helper query theo role -> recipients TODO.
    return toSeriesRes(updated)
  }
}
