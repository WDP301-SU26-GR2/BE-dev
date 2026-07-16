import { RedisService } from './redis.service'

describe('RedisService', () => {
  const makeRedis = (over: Partial<Record<string, jest.Mock>> = {}) =>
    ({
      status: 'ready',
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

  it('setNxEx returns false when Redis rejects because the stream is not writeable', async () => {
    const redis = makeRedis({ set: jest.fn().mockRejectedValue(new Error("Stream isn't writeable")) })
    const svc = new RedisService(redis)

    await expect(svc.setNxEx('cron:example', 60)).resolves.toBe(false)
  })

  // Spec 15.1 hardening — atomic quota reservation primitives
  it('incrWithTtl returns the incremented value from the atomic INCR+EXPIRE script', async () => {
    const evalMock = jest.fn().mockResolvedValue(3)
    const redis = makeRedis({ eval: evalMock })
    const svc = new RedisService(redis)

    await expect(svc.incrWithTtl('survey:vote:ipq:p1:h1', 60)).resolves.toBe(3)
    expect(evalMock).toHaveBeenCalledWith(expect.stringContaining('INCR'), 1, 'survey:vote:ipq:p1:h1', 60)
  })

  it('incrWithTtl returns null when Redis rejects (caller fails open)', async () => {
    const redis = makeRedis({ eval: jest.fn().mockRejectedValue(new Error('down')) })
    const svc = new RedisService(redis)

    await expect(svc.incrWithTtl('survey:vote:ipq:p1:h1', 60)).resolves.toBeNull()
  })

  it('decrSafe calls DECR and swallows Redis errors', async () => {
    const decr = jest.fn().mockRejectedValue(new Error('down'))
    const redis = makeRedis({ decr })
    const svc = new RedisService(redis)

    await expect(svc.decrSafe('survey:vote:ipq:p1:h1')).resolves.toBeUndefined()
    expect(decr).toHaveBeenCalledWith('survey:vote:ipq:p1:h1')
  })
})
