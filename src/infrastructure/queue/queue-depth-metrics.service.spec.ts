import { getQueueToken } from '@nestjs/bullmq'
import { QUEUE } from './queue.constant'
import { QueueDepthMetricsService } from './queue-depth-metrics.service'

describe('QueueDepthMetricsService', () => {
  it('samples all registered queues and records bounded state labels', async () => {
    const queue = {
      getJobCounts: jest.fn().mockResolvedValue({ waiting: 3, active: 2, delayed: 1, failed: 4 })
    }
    const moduleRef = { get: jest.fn().mockReturnValue(queue) }
    const metrics = { recordQueueDepth: jest.fn() }
    const service = new QueueDepthMetricsService(moduleRef as never, metrics as never)

    await service.sample()

    expect(moduleRef.get.mock.calls).toEqual(
      Object.values(QUEUE).map((name) => [getQueueToken(name), { strict: false }])
    )
    expect(queue.getJobCounts).toHaveBeenCalledTimes(3)
    expect(metrics.recordQueueDepth).toHaveBeenCalledTimes(3)
    expect(metrics.recordQueueDepth).toHaveBeenCalledWith('email', {
      waiting: 3,
      active: 2,
      delayed: 1,
      failed: 4
    })
  })

  it('keeps metrics scraping fail-isolated when a queue is unavailable', async () => {
    const moduleRef = {
      get: jest.fn().mockImplementation(() => {
        throw new Error('redis down')
      })
    }
    const metrics = { recordQueueDepth: jest.fn() }
    const service = new QueueDepthMetricsService(moduleRef as never, metrics as never)

    await expect(service.sample()).resolves.toBeUndefined()
    expect(metrics.recordQueueDepth).not.toHaveBeenCalled()
  })
})
