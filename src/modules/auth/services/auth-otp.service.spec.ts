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
  const service = new AuthOtpService(repo as never, hashing, emailQueue as never)
  return { service, repo, hashing, emailQueue }
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
