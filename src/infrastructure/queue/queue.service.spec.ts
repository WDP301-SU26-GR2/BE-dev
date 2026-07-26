import { DEFAULT_JOB_OPTIONS } from './queue.constant'
import { QueueService } from './queue.service'

describe('QueueService', () => {
  const makeMetrics = () => ({ recordQueueEnqueue: jest.fn() })

  it('enqueue calls queue.add with job name, payload and default options', async () => {
    const add = jest.fn().mockResolvedValue({ id: '1' })
    const moduleRef = { get: jest.fn().mockReturnValue({ add }) }
    const metrics = makeMetrics()
    const svc = new QueueService(moduleRef as never, { getRequestId: () => undefined } as never, metrics as never)

    await svc.enqueue('email', 'send-otp', { email: 'a@b.c' })

    expect(add).toHaveBeenCalledWith('send-otp', { email: 'a@b.c' }, DEFAULT_JOB_OPTIONS)
    expect(metrics.recordQueueEnqueue).toHaveBeenCalledWith({
      queue: 'email',
      job: 'send-otp',
      outcome: 'success',
      retryBudget: Math.max(0, Number(DEFAULT_JOB_OPTIONS.attempts ?? 0) - 1)
    })
  })

  it('passes custom job options through to queue.add', async () => {
    const add = jest.fn().mockResolvedValue({ id: '1' })
    const moduleRef = { get: jest.fn().mockReturnValue({ add }) }
    const metrics = makeMetrics()
    const svc = new QueueService(moduleRef as never, { getRequestId: () => undefined } as never, metrics as never)
    const opts = { attempts: 3 }

    await svc.enqueue('ai', 'segment-page', { aiJobId: 'x' }, opts)

    expect(add).toHaveBeenCalledWith('segment-page', { aiJobId: 'x' }, opts)
    expect(metrics.recordQueueEnqueue).toHaveBeenCalledWith({
      queue: 'ai',
      job: 'segment-page',
      outcome: 'success',
      retryBudget: 2
    })
  })

  it('records enqueue failure without swallowing the error', async () => {
    const failure = new Error('redis down')
    const moduleRef = { get: jest.fn().mockReturnValue({ add: jest.fn().mockRejectedValue(failure) }) }
    const metrics = makeMetrics()
    const svc = new QueueService(moduleRef as never, { getRequestId: () => undefined } as never, metrics as never)

    await expect(svc.enqueue('email', 'send', {})).rejects.toBe(failure)
    expect(metrics.recordQueueEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({ queue: 'email', job: 'send', outcome: 'failure' })
    )
  })
})
