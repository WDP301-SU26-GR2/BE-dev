import { Injectable, Logger } from '@nestjs/common'
import { NotificationType } from '@prisma/client'
import { NotificationService } from 'src/modules/notification/notification.service'
import { StudioAssignmentService } from 'src/modules/studio/services/studio-assignment.service'
import { AssistantProfileService } from 'src/modules/users/services/assistant-profile.service'
import { CannotReviewSelfException, ReviewRequiresEndedAssignmentException } from '../errors/reviews.errors'
import { ReviewsRepository } from '../reviews.repo'
import { CreateAssistantReviewBodyType, ReviewResType } from '../schemas/reviews-schemas'
import { ReputationService } from './reputation.service'

@Injectable()
export class AssistantReviewService {
  private readonly logger = new Logger(AssistantReviewService.name)

  constructor(
    private readonly reviewsRepository: ReviewsRepository,
    private readonly reputationService: ReputationService,
    private readonly assistantProfileService: AssistantProfileService,
    private readonly notificationService: NotificationService,
    private readonly studioAssignmentService: StudioAssignmentService
  ) {}

  async createOrUpdate(reviewerId: string, body: CreateAssistantReviewBodyType): Promise<ReviewResType> {
    if (reviewerId === body.assistantId) throw CannotReviewSelfException
    const ended = await this.studioAssignmentService.findEndedForPairById(
      reviewerId,
      body.assistantId,
      body.studioAssignmentId
    )
    if (!ended) throw ReviewRequiresEndedAssignmentException
    // Validate target has an assistant profile (throws ProfileNotFoundException if missing).
    await this.assistantProfileService.getByUserId(body.assistantId)

    const review = await this.reviewsRepository.upsertAssistantReview({
      mangakaId: reviewerId,
      assistantId: body.assistantId,
      rating: body.rating,
      comment: body.comment ?? null,
      studioAssignmentId: body.studioAssignmentId,
      seriesId: body.seriesId ?? null
    })

    const { sum, count } = await this.reviewsRepository.aggregateAssistantReviews(body.assistantId)
    const reputation = this.reputationService.compute(sum, count)
    await this.assistantProfileService.applyReputation(body.assistantId, {
      ratingAvg: reputation.ratingAvg,
      ratingCount: count,
      reputationScore: reputation.reputationScore,
      isRecommended: reputation.isRecommended
    })

    try {
      await this.notificationService.notify({
        recipientId: body.assistantId,
        type: NotificationType.REVIEW,
        referenceId: review.id,
        referenceType: 'ASSISTANT_REVIEW',
        content: null
      })
    } catch (error) {
      this.logger.warn(`Failed to notify assistant review ${review.id}: ${String(error)}`)
    }

    return { id: review.id, rating: review.rating, comment: review.comment, createdAt: review.createdAt.toISOString() }
  }

  async list(assistantId: string, options?: { limit?: number; offset?: number }): Promise<{ items: ReviewResType[] }> {
    const rows = await this.reviewsRepository.listAssistantReviews(assistantId, options)
    const reviewerMap = await this.reviewsRepository.findUserDisplayMap(rows.map((row) => row.mangakaId))
    return {
      items: rows.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt.toISOString(),
        reviewer: reviewerMap.get(r.mangakaId) ?? { id: r.mangakaId, displayName: null, avatar: null }
      }))
    }
  }
}
