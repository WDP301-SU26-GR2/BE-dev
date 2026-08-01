import { Module } from '@nestjs/common'
import { ChapterStoryboardController } from './chapter-storyboard.controller'
import { StoryboardService } from './storyboard.service'
import { StoryboardRepo } from './storyboard.repo'
import { StoryboardApprovalService } from './services/storyboard-approval.service'
import { StoryboardFacade } from './services/storyboard.facade'
import { StoryboardQueryService } from './services/storyboard-query.service'
import { StoryboardAccessService } from './services/storyboard-access.service'
import { StoryboardContentService } from './services/storyboard-content.service'
import { StoryboardReviewService } from './services/storyboard-review.service'

@Module({
  controllers: [ChapterStoryboardController],
  providers: [
    StoryboardService,
    StoryboardFacade,
    StoryboardQueryService,
    StoryboardAccessService,
    StoryboardContentService,
    StoryboardReviewService,
    StoryboardRepo,
    StoryboardApprovalService
  ],
  exports: [StoryboardService, StoryboardApprovalService]
})
export class StoryboardModule {}
