import { HttpException, HttpStatus } from '@nestjs/common'
import { SecurityMessages } from '../security.messages'

// `code` KHÔNG khai tường minh: filter derive từ `message` (= 'Error.OtpRateLimited').
// Trước 2026-07-20 chỗ này override thành 'AUTH_OTP_RATE_LIMITED' — lệch convention và tạo
// một mã thứ hai cho cùng một lỗi. `retryAfter` vẫn được filter giữ nguyên ở top-level.
export const OtpRateLimitedException = (retryAfter: number) =>
  new HttpException({ message: SecurityMessages.otpRateLimited, retryAfter }, HttpStatus.TOO_MANY_REQUESTS)
