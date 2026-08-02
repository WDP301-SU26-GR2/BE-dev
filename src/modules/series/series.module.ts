import { Module } from '@nestjs/common'
import { SeriesController } from './series.controller'
import { SeriesRepository } from './series.repo'
import { SeriesService } from './series.service'
import { SeriesPitchService } from './services/series-pitch.service'
import { SeriesProposalService } from './services/series-proposal.service'
import { SeriesClaimService } from './services/series-claim.service'
import { SeriesQueryService } from './services/series-query.service'
import { SeriesStateService } from './services/series-state.service'
import { SeriesLifecycleService } from './services/series-lifecycle.service'
import { SeriesSerializeService } from './services/series-serialize.service'
import { SeriesIntegrationListener } from './services/series-integration.listener'
import { HiatusTooLongCron } from './services/hiatus-too-long.cron'
import { SeriesMetadataService } from './services/series-metadata.service'
import { SeriesOwnershipPort } from '../transfer/ports/series-ownership.port'
import { SeriesOwnershipAdapter } from './adapters/series-ownership.adapter'
import { SeriesProposalAccessService } from './services/series-proposal-access.service'
import { SeriesLifecycleNotificationService } from './services/series-lifecycle-notification.service'
import { SeriesCompletionProposalService } from './services/series-completion-proposal.service'

// Spec 28: vòng duyệt proposal gộp với phác thảo thành 1 hành động. Chapter-storyboard
// được AppModule wire độc lập; series module không phụ thuộc storyboard và không lắng event duyệt.
@Module({
  imports: [],
  controllers: [SeriesController],
  providers: [
    SeriesService,
    SeriesRepository,
    SeriesStateService,
    SeriesProposalService,
    SeriesProposalAccessService,
    SeriesPitchService,
    SeriesClaimService,
    SeriesQueryService,
    SeriesLifecycleService,
    SeriesLifecycleNotificationService,
    SeriesCompletionProposalService,
    SeriesMetadataService,
    SeriesSerializeService,
    SeriesIntegrationListener,
    HiatusTooLongCron,
    { provide: SeriesOwnershipPort, useClass: SeriesOwnershipAdapter }
  ],
  exports: [SeriesOwnershipPort]
})
export class SeriesModule {}
