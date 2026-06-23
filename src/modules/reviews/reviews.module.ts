import { Module } from '@nestjs/common'
import { UsersModule } from '../users/users.module'
import { ReviewsController } from './reviews.controller'
import { ReviewsRepository } from './reviews.repo'
import { ReviewsService } from './reviews.service'
import { AssistantReviewService } from './services/assistant-review.service'
import { MangakaReviewService } from './services/mangaka-review.service'
import { ReputationService } from './services/reputation.service'

@Module({
  imports: [UsersModule],
  controllers: [ReviewsController],
  providers: [ReviewsService, ReviewsRepository, ReputationService, AssistantReviewService, MangakaReviewService]
})
export class ReviewsModule {}
