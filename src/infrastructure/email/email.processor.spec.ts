import { EmailProcessor } from './email.processor'

describe('EmailProcessor', () => {
  it('runs jobs through the shared queue processing metrics wrapper', async () => {
    const email = { sendOTP: jest.fn().mockResolvedValue({ error: null }) }
    const processorMetrics = {
      run: jest.fn(async (_queue: string, _job: unknown, handler: () => unknown): Promise<unknown> => await handler())
    }
    const processor = new EmailProcessor(email as never, processorMetrics as never)
    const job = { name: 'send-otp', data: { to: 'masked', otp: 'masked' }, opts: {}, attemptsMade: 0 } as never

    await processor.process(job)

    expect(processorMetrics.run).toHaveBeenCalledWith('email', job, expect.any(Function))
    expect(email.sendOTP).toHaveBeenCalledTimes(1)
  })
})
