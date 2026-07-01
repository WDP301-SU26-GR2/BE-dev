// Centralized user-facing messages for the reviews module — single source of truth.
// Plain strings only (no NestJS imports). HTTP mapping (status + path) stays in
// `errors/reviews.errors.ts`, which references the `error` codes below.
export const ReviewsMessages = {
  notification: {
    assistantReviewed: 'You received a new review from a mangaka',
    mangakaReviewed: 'You received a new review from an editor'
  },
  // Error codes (FE maps these keys to localized text). Consumed by errors/reviews.errors.ts.
  error: {
    cannotReviewSelf: 'Error.CannotReviewSelf',
    reviewRequiresEndedAssignment: 'Error.ReviewRequiresEndedAssignment'
  }
} as const
