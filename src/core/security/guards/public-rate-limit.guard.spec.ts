import { ExecutionContext } from '@nestjs/common'
import { PublicRateLimitGuard } from './public-rate-limit.guard'

jest.mock('src/core/config/envConfig', () => ({
  __esModule: true,
  default: { PUBLIC_RL_IP_MAX: 2, PUBLIC_RL_IP_WINDOW: 60 }
}))

const contextWithIp = (ip: string) =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ ip }) })
  }) as unknown as ExecutionContext

describe('PublicRateLimitGuard', () => {
  const rateLimitService = { checkAndConsume: jest.fn() }
  let guard: PublicRateLimitGuard

  beforeEach(() => {
    jest.clearAllMocks()
    guard = new PublicRateLimitGuard(rateLimitService as never)
  })

  it('allows the request and consumes the configured quota for its IP', async () => {
    rateLimitService.checkAndConsume.mockResolvedValue({ allowed: true })

    await expect(guard.canActivate(contextWithIp('1.2.3.4'))).resolves.toBe(true)
    expect(rateLimitService.checkAndConsume).toHaveBeenCalledWith({
      key: 'public:rl:ip:1.2.3.4',
      max: 2,
      windowSec: 60
    })
  })

  it('throws 429 with retry metadata when the quota is exhausted', async () => {
    rateLimitService.checkAndConsume.mockResolvedValue({ allowed: false, retryAfter: 42 })

    await expect(guard.canActivate(contextWithIp('1.2.3.4'))).rejects.toMatchObject({
      status: 429,
      response: expect.objectContaining({
        message: 'Error.PublicRateLimited',
        retryAfter: 42
      })
    })
  })

  it('uses the configured window when a blocked decision omits retryAfter', async () => {
    rateLimitService.checkAndConsume.mockResolvedValue({ allowed: false })

    await expect(guard.canActivate(contextWithIp('1.2.3.4'))).rejects.toMatchObject({
      response: expect.objectContaining({ retryAfter: 60 })
    })
  })
})
