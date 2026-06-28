import { HttpException, HttpStatus } from '@nestjs/common'
import { SecurityMessages } from '../security.messages'

export const OtpRateLimitedException = (retryAfter: number) =>
  new HttpException(
    { message: SecurityMessages.otpRateLimited, code: 'AUTH_OTP_RATE_LIMITED', retryAfter },
    HttpStatus.TOO_MANY_REQUESTS
  )
