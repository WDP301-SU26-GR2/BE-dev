import { RedisService } from './redis.service'

describe('RedisService', () => {
  const makeRedis = (over: Partial<Record<string, jest.Mock>> = {}) =>
    ({
      ping: jest.fn().mockResolvedValue('PONG'),
      set: jest.fn().mockResolvedValue('OK'),
      eval: jest.fn().mockResolvedValue(1),
      ...over
    }) as never

  it('onModuleInit PING ok does not throw', async () => {
    const redis = makeRedis()
    const svc = new RedisService(redis)
    await expect(svc.onModuleInit()).resolves.toBeUndefined()
  })

  it('onModuleInit PING fail throws', async () => {
    const redis = makeRedis({ ping: jest.fn().mockRejectedValue(new Error('down')) })
    const svc = new RedisService(redis)
    await expect(svc.onModuleInit()).rejects.toThrow()
  })

  it('setNxEx returns true when set and false when key exists', async () => {
    const redis = makeRedis({ set: jest.fn().mockResolvedValueOnce('OK').mockResolvedValueOnce(null) })
    const svc = new RedisService(redis)
    expect(await svc.setNxEx('k', 1)).toBe(true)
    expect(await svc.setNxEx('k', 1)).toBe(false)
  })
})
