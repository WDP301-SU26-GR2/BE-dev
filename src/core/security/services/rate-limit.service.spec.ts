import { RateLimitService } from '../services/rate-limit.service'

describe('RateLimitService', () => {
  const makeRedis = (evalImpl: jest.Mock) => ({ eval: evalImpl }) as never
  const makeMetrics = () => ({ recordSecurityDegraded: jest.fn() })

  it('allows when Lua returns allow', async () => {
    const svc = new RateLimitService(makeRedis(jest.fn().mockResolvedValue([1, 0, 0])), makeMetrics() as never)
    await expect(svc.checkAndConsume({ key: 'email:a', max: 5, windowSec: 3600 })).resolves.toEqual({
      allowed: true
    })
  })

  it('rejects cooldown when Lua returns cooldown', async () => {
    const svc = new RateLimitService(
      makeRedis(jest.fn().mockResolvedValue([0, 'COOLDOWN', 30])),
      makeMetrics() as never
    )
    await expect(svc.checkAndConsume({ key: 'email:a', max: 5, windowSec: 3600 })).resolves.toEqual({
      allowed: false,
      reason: 'COOLDOWN',
      retryAfter: 30
    })
  })

  it('fails open when Redis throws', async () => {
    const metrics = makeMetrics()
    const svc = new RateLimitService(makeRedis(jest.fn().mockRejectedValue(new Error('down'))), metrics as never)
    await expect(svc.checkAndConsume({ key: 'email:a', max: 5, windowSec: 3600 })).resolves.toEqual({
      allowed: true
    })
    expect(metrics.recordSecurityDegraded).toHaveBeenCalledWith('redis_rate_limit')
  })
})
