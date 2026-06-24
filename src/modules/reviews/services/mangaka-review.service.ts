import { Injectable, Logger } from '@nestjs/common'
import { NotificationType } from '@prisma/client'
import { NotificationService } from 'src/modules/notification/notification.service'
import { MangakaProfileService } from 'src/modules/users/services/mangaka-profile.service'
import { CannotReviewSelfException } from '../errors/reviews.errors'
import { ReviewsRepository } from '../reviews.repo'
import { CreateMangakaReviewBodyType, ReviewResType } from '../schemas/reviews-schemas'
import { ReputationService } from './reputation.service'

@Injectable()
export class MangakaReviewService {
  private readonly logger = new Logger(MangakaReviewService.name)

  constructor(
    private readonly reviewsRepository: ReviewsRepository,
    private readonly reputationService: ReputationService,
    private readonly mangakaProfileService: MangakaProfileService,
    private readonly notificationService: NotificationService
  ) {}

  async createOrUpdate(reviewerId: string, body: CreateMangakaReviewBodyType): Promise<ReviewResType> {
    if (reviewerId === body.mangakaId) throw CannotReviewSelfException
    await this.mangakaProfileService.getByUserId(body.mangakaId)

    const review = await this.reviewsRepository.upsertMangakaReview({
      editorId: reviewerId,
      mangakaId: body.mangakaId,
      rating: body.rating,
      comment: body.comment ?? null,
      seriesId: body.seriesId ?? null
    })

    const { sum, count } = await this.reviewsRepository.aggregateMangakaReviews(body.mangakaId)
    const reputation = this.reputationService.compute(sum, count)
    await this.mangakaProfileService.applyReputation(body.mangakaId, {
      ratingAvg: reputation.ratingAvg,
      ratingCount: count,
      reputationScore: reputation.reputationScore,
      isRecommended: reputation.isRecommended
    })

    try {
      await this.notificationService.notify({
        recipientId: body.mangakaId,
        type: NotificationType.REVIEW,
        referenceId: review.id,
        referenceType: 'MANGAKA_REVIEW',
        content: null
      })
    } catch (error) {
      this.logger.warn(`Failed to notify mangaka review ${review.id}: ${String(error)}`)
    }

    return { id: review.id, rating: review.rating, comment: review.comment, createdAt: review.createdAt.toISOString() }
  }

  async list(mangakaId: string, options?: { limit?: number; offset?: number }): Promise<{ items: ReviewResType[] }> {
    const rows = await this.reviewsRepository.listMangakaReviews(mangakaId, options)
    const reviewerMap = await this.reviewsRepository.findUserDisplayMap(rows.map((row) => row.editorId))
    return {
      items: rows.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt.toISOString(),
        reviewer: reviewerMap.get(r.editorId) ?? { id: r.editorId, displayName: null, avatar: null }
      }))
    }
  }
}
