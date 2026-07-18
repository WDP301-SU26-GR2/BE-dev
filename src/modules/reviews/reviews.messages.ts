// Centralized user-facing messages for the reviews module — single source of truth.
// Plain strings only (no NestJS imports). HTTP mapping (status + path) stays in
// `errors/reviews.errors.ts`, which references the `error` codes below.
export const ReviewsMessages = {
  notification: {
    assistantReviewed: 'Bạn nhận được đánh giá mới từ Mangaka',
    mangakaReviewed: 'Bạn nhận được đánh giá mới từ Editor'
  },
  // Error codes (FE maps these keys to localized text). Consumed by errors/reviews.errors.ts.
  error: {
    cannotReviewSelf: 'Error.CannotReviewSelf',
    reviewRequiresEndedAssignment: 'Error.ReviewRequiresEndedAssignment'
  },
  errorText: {
    'Error.CannotReviewSelf': 'Bạn không thể tự đánh giá chính mình',
    'Error.ReviewRequiresEndedAssignment': 'Chỉ có thể đánh giá sau khi hợp tác đã kết thúc'
  }
} as const
