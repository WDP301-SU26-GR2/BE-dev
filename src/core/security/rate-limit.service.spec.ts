import { RateLimitService } from './rate-limit.service'

describe('RateLimitService', () => {
  const makeRedis = (evalImpl: jest.Mock) => ({ eval: evalImpl }) as never

  it('allows when Lua returns allow', async () => {
    const svc = new RateLimitService(makeRedis(jest.fn().mockResolvedValue([1, 0, 0])))
    await expect(svc.checkAndConsume({ key: 'email:a', max: 5, windowSec: 3600 })).resolves.toEqual({
      allowed: true
    })
  })

  it('rejects cooldown when Lua returns cooldown', async () => {
    const svc = new RateLimitService(makeRedis(jest.fn().mockResolvedValue([0, 'COOLDOWN', 30])))
    await expect(svc.checkAndConsume({ key: 'email:a', max: 5, windowSec: 3600 })).resolves.toEqual({
      allowed: false,
      reason: 'COOLDOWN',
      retryAfter: 30
    })
  })

  it('fails open when Redis throws', async () => {
    const svc = new RateLimitService(makeRedis(jest.fn().mockRejectedValue(new Error('down'))))
    await expect(svc.checkAndConsume({ key: 'email:a', max: 5, windowSec: 3600 })).resolves.toEqual({
      allowed: true
    })
  })
})
