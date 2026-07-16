import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import type { Request } from 'express'
import envConfig from 'src/core/config/envConfig'
import { PublicRateLimitedException } from '../errors/public-rate-limit.error'
import { RateLimitService } from '../services/rate-limit.service'

@Injectable()
export class PublicRateLimitGuard implements CanActivate {
  constructor(private readonly rateLimitService: RateLimitService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>()
    const result = await this.rateLimitService.checkAndConsume({
      key: `public:rl:ip:${request.ip ?? ''}`,
      max: envConfig.PUBLIC_RL_IP_MAX,
      windowSec: envConfig.PUBLIC_RL_IP_WINDOW
    })

    if (!result.allowed) {
      throw PublicRateLimitedException(result.retryAfter ?? envConfig.PUBLIC_RL_IP_WINDOW)
    }

    return true
  }
}
