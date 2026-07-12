import { Injectable } from '@nestjs/common'
import { NotificationType } from '@prisma/client'
import { AppConfigService } from 'src/modules/app-config/app-config.service'
import { NotificationService } from 'src/modules/notification/notification.service'
import { StudioAssignmentService } from 'src/modules/studio/services/studio-assignment.service'
import { AssistantProfileService } from 'src/modules/users/services/assistant-profile.service'
import { ProfileNotFoundException } from 'src/modules/users/errors/users.errors'
import { CannotReviewSelfException, ReviewRequiresEndedAssignmentException } from '../errors/reviews.errors'
import { ReviewsRepository } from '../reviews.repo'
import { CreateAssistantReviewBodyType, ReviewResType } from '../schemas/reviews-schemas'
import { ReputationService } from './reputation.service'
import { ReviewsMessages } from '../reviews.messages'

@Injectable()
export class AssistantReviewService {
  constructor(
    private readonly reviewsRepository: ReviewsRepository,
    private readonly reputationService: ReputationService,
    private readonly assistantProfileService: AssistantProfileService,
    private readonly notificationService: NotificationService,
    private readonly studioAssignmentService: StudioAssignmentService,
    private readonly appConfigService: AppConfigService
  ) {}

  async createOrUpdate(reviewerId: string, body: CreateAssistantReviewBodyType): Promise<ReviewResType> {
    if (reviewerId === body.assistantId) throw CannotReviewSelfException
    const ended = await this.studioAssignmentService.findEndedForPairById(
      reviewerId,
      body.assistantId,
      body.studioAssignmentId
    )
    if (!ended) throw ReviewRequiresEndedAssignmentException
    // Target PHẢI có AssistantProfile — reputation ghi lên profile (applyReputation = update).
    // ⚠ getByUserId nay GRACEFUL (§19: chưa build profile → trả default + hasProfile:false, KHÔNG throw)
    // nên phải check cờ tường minh; nếu không, applyReputation update record không tồn tại → P2025 → 500.
    const targetProfile = await this.assistantProfileService.getByUserId(body.assistantId)
    if (!targetProfile.hasProfile) throw ProfileNotFoundException

    const review = await this.reviewsRepository.upsertAssistantReview({
      mangakaId: reviewerId,
      assistantId: body.assistantId,
      rating: body.rating,
      comment: body.comment ?? null,
      studioAssignmentId: body.studioAssignmentId,
      seriesId: body.seriesId ?? null
    })

    const { sum, count } = await this.reviewsRepository.aggregateAssistantReviews(body.assistantId)
    const config = await this.appConfigService.get()
    const reputation = this.reputationService.compute(sum, count, config.reputationRecommendThreshold)
    await this.assistantProfileService.applyReputation(body.assistantId, {
      ratingAvg: reputation.ratingAvg,
      ratingCount: count,
      reputationScore: reputation.reputationScore,
      isRecommended: reputation.isRecommended
    })

    await this.notificationService.notifySafe({
      recipientId: body.assistantId,
      type: NotificationType.REVIEW,
      referenceId: review.id,
      referenceType: 'ASSISTANT_REVIEW_RECEIVED',
      content: ReviewsMessages.notification.assistantReviewed
    })

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
