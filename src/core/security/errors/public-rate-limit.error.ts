import { HttpException, HttpStatus } from '@nestjs/common'
import { SecurityMessages } from '../security.messages'

export const PublicRateLimitedException = (retryAfter: number) =>
  new HttpException(
    {
      message: SecurityMessages.publicRateLimited,
      code: 'PUBLIC_RATE_LIMITED',
      retryAfter
    },
    HttpStatus.TOO_MANY_REQUESTS
  )
