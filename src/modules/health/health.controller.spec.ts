import { HealthController } from './health.controller'

describe('HealthController', () => {
  it('delegates liveness and readiness without exposing dependency details', async () => {
    const health = {
      liveness: jest.fn().mockReturnValue({ status: 'ok' }),
      readiness: jest.fn().mockResolvedValue({ status: 'ok' })
    }
    const controller = new HealthController(health as never)

    expect(controller.live()).toEqual({ status: 'ok' })
    await expect(controller.ready()).resolves.toEqual({ status: 'ok' })
    expect(health.liveness).toHaveBeenCalledTimes(1)
    expect(health.readiness).toHaveBeenCalledTimes(1)
  })
})
