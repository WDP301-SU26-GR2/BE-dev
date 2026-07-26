import { RequestContextService } from './request-context.service'

describe('RequestContextService', () => {
  it('keeps request IDs isolated across concurrent async work', async () => {
    const context = new RequestContextService()
    const [first, second] = await Promise.all([
      context.run('req-a', async () => {
        await Promise.resolve()
        return context.getRequestId()
      }),
      context.run('req-b', async () => {
        await Promise.resolve()
        return context.getRequestId()
      })
    ])
    expect([first, second]).toEqual(['req-a', 'req-b'])
  })
})
