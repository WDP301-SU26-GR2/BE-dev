import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import type { Request } from 'express'
import { otpIpRule } from '../constants/rate-limit.constant'
import { OtpRateLimitedException } from '../errors/rate-limit.errors'
import { RateLimitService } from '../services/rate-limit.service'

/**
 * Spec 14 §4: the guard only enforces the IP ceiling, consuming every request to protect the endpoint.
 * Email cooldown/quota lives in AuthOtpService.issueOtp so failed validation or business checks do not
 * consume the mailbox quota before an OTP is actually issued.
 */
@Injectable()
export class OtpRateLimitGuard implements CanActivate {
  constructor(private readonly rateLimitService: RateLimitService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>()
    const ipDecision = await this.rateLimitService.checkAndConsume(otpIpRule(req.ip ?? 'unknown'))
    if (!ipDecision.allowed) throw OtpRateLimitedException(ipDecision.retryAfter)
    return true
  }
}
