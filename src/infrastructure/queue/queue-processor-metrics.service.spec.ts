import { QueueProcessorMetricsService } from './queue-processor-metrics.service'

describe('QueueProcessorMetricsService', () => {
  const job = (attemptsMade: number, attempts: number) =>
    ({
      name: 'send-otp',
      timestamp: Date.now() - 2000,
      attemptsMade,
      opts: { attempts }
    }) as never

  it('records successful processing latency and queue age', async () => {
    const metrics = { recordQueueProcessing: jest.fn() }
    const service = new QueueProcessorMetricsService(metrics as never)

    await expect(service.run('email', job(0, 3), () => 'sent')).resolves.toBe('sent')

    expect(metrics.recordQueueProcessing).toHaveBeenCalledWith(
      expect.objectContaining({
        queue: 'email',
        job: 'send-otp',
        outcome: 'success',
        durationSeconds: expect.any(Number),
        ageSeconds: expect.any(Number)
      })
    )
    expect(metrics.recordQueueProcessing.mock.calls[0][0].ageSeconds).toBeGreaterThanOrEqual(1.9)
  })

  it('records a retry and rethrows when attempts remain', async () => {
    const metrics = { recordQueueProcessing: jest.fn() }
    const service = new QueueProcessorMetricsService(metrics as never)
    const failure = new Error('provider unavailable')

    await expect(
      service.run('email', job(0, 3), () => {
        throw failure
      })
    ).rejects.toBe(failure)

    expect(metrics.recordQueueProcessing).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'retry' }))
  })

  it('records a terminal failure and rethrows on the last attempt', async () => {
    const metrics = { recordQueueProcessing: jest.fn() }
    const service = new QueueProcessorMetricsService(metrics as never)
    const failure = new Error('provider unavailable')

    await expect(
      service.run('email', job(2, 3), () => {
        throw failure
      })
    ).rejects.toBe(failure)

    expect(metrics.recordQueueProcessing).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'failure' }))
  })
})
