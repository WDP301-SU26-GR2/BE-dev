import { OtpPurpose } from '../auth.constant'
import { InvalidOTPException, OTPExpiredException, OtpLockedException } from '../errors/auth.errors'
import { AuthOtpService } from './auth-otp.service'

function makeService(overrides: { otp?: unknown; compare?: boolean }) {
  const repo = {
    createOtpRequest: jest.fn().mockResolvedValue(undefined),
    findOtpRequest: jest.fn().mockResolvedValue(overrides.otp),
    incrementOtpAttempts: jest.fn().mockResolvedValue(undefined)
  }
  const hashing = {
    hash: jest.fn().mockResolvedValue('otp-hash'),
    compare: jest.fn().mockResolvedValue(overrides.compare ?? false)
  }
  const emailQueue = { enqueueOtp: jest.fn().mockResolvedValue(undefined) }
  const rateLimitService = { checkAndConsume: jest.fn().mockResolvedValue({ allowed: true }) }
  const service = new AuthOtpService(repo as never, hashing, emailQueue as never, rateLimitService as never)
  return { service, repo, hashing, emailQueue, rateLimitService }
}

const future = new Date(Date.now() + 60_000)
const past = new Date(Date.now() - 60_000)

describe('AuthOtpService.validateOtpCode', () => {
  it('issueOtp creates OtpRequest and enqueues email without throwing', async () => {
    const { service, repo, emailQueue } = makeService({ otp: null })

    await service.issueOtp('a@b.com', OtpPurpose.REGISTER)

    expect(repo.createOtpRequest).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'a@b.com', otpCodeHash: 'otp-hash', purpose: OtpPurpose.REGISTER })
    )
    expect(emailQueue.enqueueOtp).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'a@b.com', code: expect.any(String), expiresInMinutes: expect.any(Number) })
    )
  })

  it('throws InvalidOTP when no otp record exists', async () => {
    const { service } = makeService({ otp: null })

    await expect(
      service.validateOtpCode({ email: 'a@b.com', code: '123456', purpose: OtpPurpose.REGISTER })
    ).rejects.toBe(InvalidOTPException)
  })

  it('throws OTPExpired when the record is expired', async () => {
    const { service } = makeService({ otp: { attempts: 0, expiresAt: past, otpCodeHash: 'hash' } })

    await expect(
      service.validateOtpCode({ email: 'a@b.com', code: '123456', purpose: OtpPurpose.REGISTER })
    ).rejects.toBe(OTPExpiredException)
  })

  it('throws OtpLocked when attempts are exhausted', async () => {
    const { service } = makeService({ otp: { attempts: 5, expiresAt: future, otpCodeHash: 'hash' } })

    await expect(
      service.validateOtpCode({ email: 'a@b.com', code: '123456', purpose: OtpPurpose.REGISTER })
    ).rejects.toBe(OtpLockedException)
  })

  it('increments attempts and throws InvalidOTP on wrong code', async () => {
    const { service, repo } = makeService({
      otp: { attempts: 1, expiresAt: future, otpCodeHash: 'hash' },
      compare: false
    })

    await expect(
      service.validateOtpCode({ email: 'a@b.com', code: '000000', purpose: OtpPurpose.REGISTER })
    ).rejects.toBe(InvalidOTPException)
    expect(repo.incrementOtpAttempts).toHaveBeenCalledWith({ email: 'a@b.com', purpose: OtpPurpose.REGISTER })
  })

  it('returns the record on correct code', async () => {
    const otp = { attempts: 0, expiresAt: future, otpCodeHash: 'hash' }
    const { service } = makeService({ otp, compare: true })

    await expect(
      service.validateOtpCode({ email: 'a@b.com', code: '123456', purpose: OtpPurpose.REGISTER })
    ).resolves.toBe(otp)
  })
})

// Spec 14 §4: rate-limit email chuyển xuống issueOtp.
describe('AuthOtpService.issueOtp rate-limit', () => {
  const makeRateLimitService = (allowed: boolean) => ({
    checkAndConsume: jest
      .fn()
      .mockResolvedValue(allowed ? { allowed: true } : { allowed: false, reason: 'COOLDOWN', retryAfter: 30 })
  })

  const makeIssueOtpService = (allowed: boolean) => {
    const rateLimitService = makeRateLimitService(allowed)
    const repo = { createOtpRequest: jest.fn().mockResolvedValue(undefined) }
    const hashing = { hash: jest.fn().mockResolvedValue('hashed') }
    const emailQueue = { enqueueOtp: jest.fn().mockResolvedValue(undefined) }
    const service = new AuthOtpService(repo as never, hashing as never, emailQueue as never, rateLimitService as never)
    return { service, repo, emailQueue, rateLimitService }
  }

  it('consumes the email rule and issues OTP when allowed', async () => {
    const { service, repo, emailQueue, rateLimitService } = makeIssueOtpService(true)

    await service.issueOtp('a@b.com', OtpPurpose.REGISTER)

    expect(rateLimitService.checkAndConsume).toHaveBeenCalledTimes(1)
    expect(repo.createOtpRequest).toHaveBeenCalledTimes(1)
    expect(emailQueue.enqueueOtp).toHaveBeenCalledTimes(1)
  })

  it('throws 429 and does not create an OtpRequest when the email rule is exhausted', async () => {
    const { service, repo, emailQueue } = makeIssueOtpService(false)

    await expect(service.issueOtp('a@b.com', OtpPurpose.REGISTER)).rejects.toMatchObject({
      status: 429,
      response: {
        message: 'Error.OtpRateLimited',
        code: 'AUTH_OTP_RATE_LIMITED',
        retryAfter: 30
      }
    })
    expect(repo.createOtpRequest).not.toHaveBeenCalled()
    expect(emailQueue.enqueueOtp).not.toHaveBeenCalled()
  })

  it('skips the auth email rule for OtpPurpose.VOTE because survey owns its limiter', async () => {
    const { service, repo, rateLimitService } = makeIssueOtpService(false)

    await service.issueOtp('guest@b.com', OtpPurpose.VOTE)

    expect(rateLimitService.checkAndConsume).not.toHaveBeenCalled()
    expect(repo.createOtpRequest).toHaveBeenCalledTimes(1)
  })
})
