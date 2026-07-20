import { HttpException, HttpStatus } from '@nestjs/common'
import { SecurityMessages } from '../security.messages'

// `code` derive từ `message` (= 'Error.PublicRateLimited') — xem ghi chú ở rate-limit.errors.ts.
export const PublicRateLimitedException = (retryAfter: number) =>
  new HttpException({ message: SecurityMessages.publicRateLimited, retryAfter }, HttpStatus.TOO_MANY_REQUESTS)
