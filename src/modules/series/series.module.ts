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
import { NameApprovedListener } from './services/name-approved.listener'
import { HiatusTooLongCron } from './services/hiatus-too-long.cron'
import { NameModule } from 'src/modules/name/name.module'
import { SeriesMetadataService } from './services/series-metadata.service'
import { SeriesOwnershipPort } from '../transfer/ports/series-ownership.port'
import { SeriesOwnershipAdapter } from './adapters/series-ownership.adapter'
import { SeriesProposalAccessService } from './services/series-proposal-access.service'
import { SeriesLifecycleNotificationService } from './services/series-lifecycle-notification.service'
import { SeriesCompletionProposalService } from './services/series-completion-proposal.service'

// Spec 8 §6: NameApprovedListener lắng NameApproved event (emit bởi name module SAU commit) →
// nếu kind=PROPOSAL → advance READY_TO_PITCH. kind=CHAPTER → no-op.
// SeriesStateService reads Name status (still needed by tryAdvanceToReadyToPitch proposal-approve
// path + listener) → NameRepo from name module.
// NameController (cùng base path) giờ thuộc NameModule — xem name/name.module.ts.
@Module({
  imports: [NameModule],
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
    NameApprovedListener,
    HiatusTooLongCron,
    { provide: SeriesOwnershipPort, useClass: SeriesOwnershipAdapter }
  ],
  exports: [SeriesOwnershipPort]
})
export class SeriesModule {}
