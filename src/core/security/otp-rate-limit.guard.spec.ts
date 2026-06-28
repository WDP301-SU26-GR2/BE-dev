import { OtpRateLimitGuard } from './otp-rate-limit.guard'

describe('OtpRateLimitGuard', () => {
  const ctx = (body: unknown, ip = '1.2.3.4') =>
    ({ switchToHttp: () => ({ getRequest: () => ({ body, ip }) }) }) as never

  it('allows when both rules allow', async () => {
    const rl = { checkAndConsume: jest.fn().mockResolvedValue({ allowed: true }) }
    const guard = new OtpRateLimitGuard(rl as never)

    await expect(guard.canActivate(ctx({ email: 'a@b.c' }))).resolves.toBe(true)
    expect(rl.checkAndConsume).toHaveBeenCalledTimes(2)
  })

  it('throws 429 when a rule rejects', async () => {
    const rl = {
      checkAndConsume: jest.fn().mockResolvedValue({ allowed: false, reason: 'QUOTA', retryAfter: 10 })
    }
    const guard = new OtpRateLimitGuard(rl as never)

    await expect(guard.canActivate(ctx({ email: 'a@b.c' }))).rejects.toMatchObject({ status: 429 })
  })

  it('skips when email is missing', async () => {
    const rl = { checkAndConsume: jest.fn() }
    const guard = new OtpRateLimitGuard(rl as never)

    await expect(guard.canActivate(ctx({}))).resolves.toBe(true)
    expect(rl.checkAndConsume).not.toHaveBeenCalled()
  })
})
