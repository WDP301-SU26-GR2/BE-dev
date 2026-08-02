import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { createHash, timingSafeEqual } from 'node:crypto'
import envConfig from 'src/core/config/envConfig'
import { HealthMessages } from '../health.messages'

export const METRICS_API_KEY_HEADER = 'x-api-key'

const digest = (value: string): Buffer => createHash('sha256').update(value, 'utf8').digest()
const expectedApiKeyDigest = digest(envConfig.API_KEY)

@Injectable()
export class MetricsApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | string[] | undefined> }>()
    const header = request.headers[METRICS_API_KEY_HEADER]
    const suppliedApiKey = typeof header === 'string' ? header : ''
    const matches = timingSafeEqual(digest(suppliedApiKey), expectedApiKeyDigest)

    if (typeof header !== 'string' || !matches) {
      throw new UnauthorizedException(HealthMessages.error.invalidMetricsApiKey)
    }

    return true
  }
}
