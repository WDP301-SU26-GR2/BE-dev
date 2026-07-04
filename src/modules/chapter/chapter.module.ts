import { Module } from '@nestjs/common'
import { ChapterController } from './chapter.controller'
import { ChapterRepository } from './chapter.repo'
import { ChapterService } from './chapter.service'
import { ChapterCreationService } from './services/chapter-creation.service'
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
import { StudioOverviewController } from './studio-overview.controller'

@Module({
  controllers: [ChapterController, StudioOverviewController],
  providers: [
    ChapterService,
    ChapterRepository,
    ManuscriptStateService,
    PageStateService,
    ChapterCreationService,
    ChapterHoldService,
    ChapterProgressService,
    ScheduleService,
    PageService,
    ManuscriptReviewService,
    ChapterPublishService,
    ChapterPublishedListener,
    DeadlineWarningCron
  ],
  exports: [PageStateService, ManuscriptStateService, ScheduleService]
})
export class ChapterModule {}
