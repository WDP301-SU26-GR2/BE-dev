import { UnprocessableEntityException } from '@nestjs/common'
import { ReviewsMessages } from '../reviews.messages'

// Reviewer không được tự đánh giá chính mình.
export const CannotReviewSelfException = new UnprocessableEntityException([
  { message: ReviewsMessages.error.cannotReviewSelf, path: 'targetId' }
])
export const ReviewRequiresEndedAssignmentException = new UnprocessableEntityException([
  { message: ReviewsMessages.error.reviewRequiresEndedAssignment, path: 'studioAssignmentId' }
])
