import { UnprocessableEntityException } from '@nestjs/common'

// Reviewer không được tự đánh giá chính mình.
export const CannotReviewSelfException = new UnprocessableEntityException([
  {
    message: 'Error.CannotReviewSelf',
    path: 'targetId'
  }
])
