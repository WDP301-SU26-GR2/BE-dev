import { Injectable } from '@nestjs/common'
import { CreateAssistantReviewBodyType, CreateMangakaReviewBodyType } from './schemas/reviews-schemas'
import { AssistantReviewService } from './services/assistant-review.service'
import { MangakaReviewService } from './services/mangaka-review.service'

@Injectable()
export class ReviewsService {
  constructor(
    private readonly assistantReviewService: AssistantReviewService,
    private readonly mangakaReviewService: MangakaReviewService
  ) {}

  createAssistantReview(reviewerId: string, body: CreateAssistantReviewBodyType) {
    return this.assistantReviewService.createOrUpdate(reviewerId, body)
  }

  listAssistantReviews(assistantId: string, options?: { limit?: number; offset?: number }) {
    return this.assistantReviewService.list(assistantId, options)
  }

  createMangakaReview(reviewerId: string, body: CreateMangakaReviewBodyType) {
    return this.mangakaReviewService.createOrUpdate(reviewerId, body)
  }

  listMangakaReviews(mangakaId: string, options?: { limit?: number; offset?: number }) {
    return this.mangakaReviewService.list(mangakaId, options)
  }
}
