import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import type { Request } from 'express'
import { otpEmailRule, otpIpRule } from '../constants/rate-limit.constant'
import { OtpRateLimitedException } from '../errors/rate-limit.errors'
import { RateLimitService } from '../services/rate-limit.service'

@Injectable()
export class OtpRateLimitGuard implements CanActivate {
  constructor(private readonly rateLimitService: RateLimitService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>()
    const email = (req.body as { email?: unknown })?.email
    if (typeof email !== 'string' || email.length === 0) return true

    const emailDecision = await this.rateLimitService.checkAndConsume(otpEmailRule(email))
    if (!emailDecision.allowed) throw OtpRateLimitedException(emailDecision.retryAfter)

    const ipDecision = await this.rateLimitService.checkAndConsume(otpIpRule(req.ip ?? 'unknown'))
    if (!ipDecision.allowed) throw OtpRateLimitedException(ipDecision.retryAfter)

    return true
  }
}
