import { Module } from '@nestjs/common'
import { ChapterController } from './chapter.controller'
import { ChapterRepository } from './chapter.repo'
import { ChapterService } from './chapter.service'
import { ChapterCreationService } from './services/chapter-creation.service'
import { ChapterPublishService } from './services/chapter-publish.service'
import { ManuscriptReviewService } from './services/manuscript-review.service'
import { ManuscriptStateService } from './services/manuscript-state.service'
import { PageService } from './services/page.service'
import { PageStateService } from './services/page-state.service'
import { ScheduleService } from './services/schedule.service'
import { ChapterPublishedListener } from './services/chapter-notification.listener'
import { DeadlineWarningCron } from './services/deadline-warning.cron'

@Module({
  controllers: [ChapterController],
  providers: [
    ChapterService,
    ChapterRepository,
    ManuscriptStateService,
    PageStateService,
    ChapterCreationService,
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
