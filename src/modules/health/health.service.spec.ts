import { ServiceNotReadyException } from './errors/health.errors'
import { HealthService } from './health.service'

describe('HealthService', () => {
  it('keeps liveness independent from dependencies', () => {
    const service = new HealthService({} as never, {} as never)
    expect(service.liveness()).toEqual({ status: 'ok' })
  })

  it('reports ready only when MongoDB and Redis both answer', async () => {
    const prisma = { $runCommandRaw: jest.fn().mockResolvedValue({ ok: 1 }) }
    const redis = { ping: jest.fn().mockResolvedValue(true) }
    await expect(new HealthService(prisma as never, redis as never).readiness()).resolves.toEqual({
      status: 'ok'
    })
  })

  it.each([
    [{ $runCommandRaw: jest.fn().mockRejectedValue(new Error('mongo down')) }, { ping: jest.fn() }],
    [{ $runCommandRaw: jest.fn().mockResolvedValue({ ok: 1 }) }, { ping: jest.fn().mockResolvedValue(false) }]
  ])('returns a sanitized readiness error when a core dependency is down', async (prisma, redis) => {
    await expect(new HealthService(prisma as never, redis as never).readiness()).rejects.toBe(ServiceNotReadyException)
  })
})
