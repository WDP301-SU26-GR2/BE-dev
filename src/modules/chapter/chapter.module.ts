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
import { ProductionStageFacade } from './services/production-stage.facade'
import { ProductionStageStateService } from './services/production-stage-state.service'
import { ProductionStageQueryService } from './services/production-stage-query.service'
import { ProductionStageQueryPort as TaskProductionStageQueryPort } from 'src/modules/task/ports/production-stage-query.port'
import { ProductionStageQueryPort as AiProductionStageQueryPort } from 'src/modules/ai/ports/production-stage-query.port'
import { ChapterPageAccessService } from './services/chapter-page-access.service'
import { PageCleanupService } from './services/page-cleanup.service'
import { ProductionStageAccessService } from './services/production-stage-access.service'
import { ProductionStageAnalyticsService } from './services/production-stage-analytics.service'
import { ChapterPlanningService } from './services/chapter-planning.service'
import { ChapterProductionService } from './services/chapter-production.service'
import { ChapterQueryService } from './services/chapter-query.service'

@Module({
  imports: [StudioModule],
  controllers: [ChapterController, StudioOverviewController, ProductionStageController],
  providers: [
    ChapterService,
    ChapterPlanningService,
    ChapterProductionService,
    ChapterQueryService,
    ChapterRepository,
    ManuscriptStateService,
    PageStateService,
    ChapterCreationService,
    ChapterCrudService,
    ChapterHoldService,
    ChapterProgressService,
    ScheduleService,
    PageService,
    ChapterPageAccessService,
    PageCleanupService,
    ManuscriptReviewService,
    ChapterPublishService,
    ChapterCoOwnerService,
    ChapterPublishedListener,
    DeadlineWarningCron,
    CoOwnerEscalationCron,
    ProductionStageRepository,
    ProductionStageQueryService,
    { provide: TaskProductionStageQueryPort, useExisting: ProductionStageQueryService },
    { provide: AiProductionStageQueryPort, useExisting: ProductionStageQueryService },
    ProductionStageStateService,
    ProductionStageService,
    ProductionStageFacade,
    ProductionStageAccessService,
    ProductionStageAnalyticsService,
    ProductionStagePageService,
    ProductionStageSeedListener
  ],
  exports: [
    PageStateService,
    ManuscriptStateService,
    ScheduleService,
    ChapterProgressService,
    TaskProductionStageQueryPort,
    AiProductionStageQueryPort,
    ProductionStageStateService
  ]
})
export class ChapterModule {}
