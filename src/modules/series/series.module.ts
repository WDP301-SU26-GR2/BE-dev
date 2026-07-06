import { Module } from '@nestjs/common'
import { NameController } from './name.controller'
import { SeriesController } from './series.controller'
import { SeriesRepository } from './series.repo'
import { SeriesService } from './series.service'
import { NameService } from './services/name.service'
import { SeriesPitchService } from './services/series-pitch.service'
import { SeriesProposalService } from './services/series-proposal.service'
import { SeriesClaimService } from './services/series-claim.service'
import { SeriesQueryService } from './services/series-query.service'
import { SeriesStateService } from './services/series-state.service'
import { SeriesLifecycleService } from './services/series-lifecycle.service'
import { SeriesSerializeService } from './services/series-serialize.service'
import { SeriesIntegrationListener } from './services/series-integration.listener'

@Module({
  controllers: [SeriesController, NameController],
  providers: [
    SeriesService,
    SeriesRepository,
    SeriesStateService,
    SeriesProposalService,
    NameService,
    SeriesPitchService,
    SeriesClaimService,
    SeriesQueryService,
    SeriesLifecycleService,
    SeriesSerializeService,
    SeriesIntegrationListener
  ]
})
export class SeriesModule {}
