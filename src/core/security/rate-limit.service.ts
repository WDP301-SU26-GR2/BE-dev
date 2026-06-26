import { Injectable, Logger } from '@nestjs/common'
import { RedisService } from 'src/infrastructure/redis/redis.service'
import type { RateLimitDecision, RateLimitRule } from './rate-limit.constant'

const SCRIPT = `
local cdKey = KEYS[1]
local qKey = KEYS[2]
local cooldown = tonumber(ARGV[1])
local max = tonumber(ARGV[2])
local windowSec = tonumber(ARGV[3])
if cooldown > 0 then
  if redis.call('SET', cdKey, '1', 'NX', 'EX', cooldown) == false then
    return {0, 'COOLDOWN', redis.call('TTL', cdKey)}
  end
end
local count = redis.call('INCR', qKey)
if count == 1 then redis.call('EXPIRE', qKey, windowSec) end
if count > max then
  return {0, 'QUOTA', redis.call('TTL', qKey)}
end
return {1, 0, 0}
`

@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name)

  constructor(private readonly redisService: RedisService) {}

  async checkAndConsume(rule: RateLimitRule): Promise<RateLimitDecision> {
    const cdKey = `rl:cd:${rule.key}`
    const qKey = `rl:q:${rule.key}`

    try {
      const res = (await this.redisService.eval(
        SCRIPT,
        [cdKey, qKey],
        [rule.cooldownSec ?? 0, rule.max, rule.windowSec]
      )) as [number, string | number, number]

      if (res[0] === 1) return { allowed: true }
      return { allowed: false, reason: res[1] as 'COOLDOWN' | 'QUOTA', retryAfter: Number(res[2]) }
    } catch (err) {
      this.logger.error('rate-limit fail-open (Redis error)', err as Error)
      return { allowed: true }
    }
  }
}
