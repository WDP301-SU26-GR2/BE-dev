import { Module } from '@nestjs/common'
import { ChapterController } from './chapter.controller'
import { ChapterRepository } from './chapter.repo'
import { ChapterService } from './chapter.service'
import { ChapterCreationService } from './services/chapter-creation.service'
import { ChapterCrudService } from './services/chapter-crud.service'
import { ChapterHoldService } from './services/chapter-hold.service'
import { ChapterProgressService } from './services/chapter-progress.service'
import { ChapterPublishService } from './services/chapter-publish.service'
import { ManuscriptReviewService } from './services/manuscript-review.service'
import { ManuscriptStateService } from './services/manuscript-state.service'
import { PageService } from './services/page.service'
import { PageStateService } from './services/page-state.service'
import { ScheduleService } from './services/schedule.service'
import { ChapterPublishedListener } from './services/chapter-notification.listener'
import { DeadlineWarningCron } from './services/deadline-warning.cron'
import { ChapterCoOwnerService } from './services/chapter-coowner.service'
import { CoOwnerEscalationCron } from './services/coowner-escalation.cron'
import { StudioOverviewController } from './studio-overview.controller'
import { StudioModule } from 'src/modules/studio/studio.module'
import { ProductionStageController } from './production-stage.controller'
import { ProductionStageRepository } from './production-stage.repo'
import { ProductionStagePageService } from './services/production-stage-page.service'
import { ProductionStageSeedListener } from './services/production-stage-seed.listener'
import { ProductionStageService } from './services/production-stage.service'
import { ProductionStageStateService } from './services/production-stage-state.service'

@Module({
  imports: [StudioModule],
  controllers: [ChapterController, StudioOverviewController, ProductionStageController],
  providers: [
    ChapterService,
    ChapterRepository,
    ManuscriptStateService,
    PageStateService,
    ChapterCreationService,
    ChapterCrudService,
    ChapterHoldService,
    ChapterProgressService,
    ScheduleService,
    PageService,
    ManuscriptReviewService,
    ChapterPublishService,
    ChapterCoOwnerService,
    ChapterPublishedListener,
    DeadlineWarningCron,
    CoOwnerEscalationCron,
    ProductionStageRepository,
    ProductionStageStateService,
    ProductionStageService,
    ProductionStagePageService,
    ProductionStageSeedListener
  ],
  exports: [
    PageStateService,
    ManuscriptStateService,
    ScheduleService,
    ChapterProgressService,
    ProductionStageRepository,
    ProductionStageStateService
  ]
})
export class ChapterModule {}
