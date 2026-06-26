import { DEFAULT_JOB_OPTIONS } from './queue.constant'
import { QueueService } from './queue.service'

describe('QueueService', () => {
  it('enqueue calls queue.add with job name, payload and default options', async () => {
    const add = jest.fn().mockResolvedValue({ id: '1' })
    const moduleRef = { get: jest.fn().mockReturnValue({ add }) }
    const svc = new QueueService(moduleRef as never)

    await svc.enqueue('email', 'send-otp', { email: 'a@b.c' })

    expect(add).toHaveBeenCalledWith('send-otp', { email: 'a@b.c' }, DEFAULT_JOB_OPTIONS)
  })
})
