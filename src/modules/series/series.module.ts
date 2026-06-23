import { Module } from '@nestjs/common'
import { NameController } from './name.controller'
import { SeriesController } from './series.controller'
import { SeriesRepository } from './series.repo'
import { SeriesService } from './series.service'
import { NameService } from './services/name.service'
import { SeriesPitchService } from './services/series-pitch.service'
import { SeriesProposalService } from './services/series-proposal.service'
import { SeriesStateService } from './services/series-state.service'

@Module({
  controllers: [SeriesController, NameController],
  providers: [
    SeriesService,
    SeriesRepository,
    SeriesStateService,
    SeriesProposalService,
    NameService,
    SeriesPitchService
  ]
})
export class SeriesModule {}
