import { NotificationProcessor } from './notification.processor'

describe('NotificationProcessor', () => {
  it('runs jobs through the shared queue processing metrics wrapper', async () => {
    const notification = { notify: jest.fn().mockResolvedValue(undefined) }
    const processorMetrics = {
      run: jest.fn(async (_queue: string, _job: unknown, handler: () => unknown): Promise<unknown> => await handler())
    }
    const processor = new NotificationProcessor(notification as never, processorMetrics as never)
    const job = { name: 'dispatch', data: { recipientId: 'masked' }, opts: {}, attemptsMade: 0 } as never

    await processor.process(job)

    expect(processorMetrics.run).toHaveBeenCalledWith('notification', job, expect.any(Function))
    expect(notification.notify).toHaveBeenCalledTimes(1)
  })
})
