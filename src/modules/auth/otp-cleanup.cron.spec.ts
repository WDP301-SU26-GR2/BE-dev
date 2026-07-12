import { Logger } from '@nestjs/common'
import { AuthRepository } from './auth.repo'
import { OtpCleanupCron } from './otp-cleanup.cron'

function makeCron(locked: boolean) {
  const redisService = { setNxEx: jest.fn().mockResolvedValue(locked) }
  const authRepository = { deleteExpiredOtpRequests: jest.fn().mockResolvedValue({ count: 3 }) }
  return { cron: new OtpCleanupCron(redisService as never, authRepository as never), redisService, authRepository }
}

describe('OtpCleanupCron (Fix-2 G-11)', () => {
  let logSpy: jest.SpyInstance

  beforeEach(() => {
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation()
  })

  afterEach(() => {
    logSpy.mockRestore()
  })

  it('deletes expired OTP rows when it wins the Redis lock', async () => {
    const d = makeCron(true)

    await d.cron.run()

    expect(d.redisService.setNxEx).toHaveBeenCalledWith('cron:otp-cleanup', 600)
    expect(d.authRepository.deleteExpiredOtpRequests).toHaveBeenCalledWith(expect.any(Date))
    expect(logSpy).toHaveBeenCalledWith('OTP cleanup cron: removed 3 expired otp requests')
  })

  it('skips entirely when another instance holds the lock', async () => {
    const d = makeCron(false)

    await d.cron.run()

    expect(d.authRepository.deleteExpiredOtpRequests).not.toHaveBeenCalled()
    expect(logSpy).not.toHaveBeenCalled()
  })

  it('repo lỗi → cron KHÔNG reject, chỉ log error', async () => {
    const redisService = { setNxEx: jest.fn().mockResolvedValue(true) }
    const authRepository = {
      deleteExpiredOtpRequests: jest.fn().mockRejectedValue(new Error('mongo down'))
    }
    const cron = new OtpCleanupCron(redisService as never, authRepository as never)
    const errSpy = jest
      .spyOn((cron as never as { logger: { error: jest.Mock } }).logger, 'error')
      .mockImplementation(() => undefined)

    await expect(cron.run()).resolves.toBeUndefined()

    expect(errSpy).toHaveBeenCalled()
  })
})

describe('AuthRepository.deleteExpiredOtpRequests', () => {
  it('deletes only OTP rows whose expiration is before now', async () => {
    const now = new Date('2026-07-11T04:00:00.000Z')
    const otpRequest = { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) }
    const repo = new AuthRepository({ otpRequest } as never)

    await expect(repo.deleteExpiredOtpRequests(now)).resolves.toEqual({ count: 2 })

    expect(otpRequest.deleteMany).toHaveBeenCalledWith({ where: { expiresAt: { lt: now } } })
  })
})
