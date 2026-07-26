import { createTransactionContext } from 'src/infrastructure/database/transaction-context'
import { AUTH_OTP_MAX_ATTEMPTS } from '../auth.constant'
import { InvalidOTPException, OTPExpiredException, OtpLockedException } from '../errors/auth.errors'
import { SigningOtpAdapter } from './signing-otp.adapter'

describe('SigningOtpAdapter', () => {
  const command = {
    email: 'signer@example.com',
    purpose: 'SIGNING_CONTRACT',
    code: '123456'
  } as const

  const setup = (otp: Record<string, unknown> | null, compare = true, consumed = 1) => {
    const tx = {
      otpRequest: {
        findUnique: jest.fn().mockResolvedValue(otp),
        deleteMany: jest.fn().mockResolvedValue({ count: consumed })
      }
    }
    const hashing = { compare: jest.fn().mockResolvedValue(compare) }
    return {
      adapter: new SigningOtpAdapter(hashing as never),
      context: createTransactionContext(tx as never),
      hashing,
      tx
    }
  }

  const validOtp = () => ({
    id: '507f1f77bcf86cd799439011',
    isUsed: false,
    expiresAt: new Date(Date.now() + 60_000),
    attempts: 0,
    otpCodeHash: 'hash'
  })

  it.each([[null], [{ ...validOtp(), isUsed: true }]])('rejects missing or already-used OTP state', async (otp) => {
    const fixture = setup(otp)
    await expect(fixture.adapter.consumeSigningOtp(fixture.context, command)).rejects.toBe(InvalidOTPException)
    expect(fixture.hashing.compare).not.toHaveBeenCalled()
  })

  it('rejects expired, locked, and mismatched codes before consuming state', async () => {
    const expired = setup({ ...validOtp(), expiresAt: new Date(Date.now() - 1) })
    await expect(expired.adapter.consumeSigningOtp(expired.context, command)).rejects.toBe(OTPExpiredException)

    const locked = setup({ ...validOtp(), attempts: AUTH_OTP_MAX_ATTEMPTS })
    await expect(locked.adapter.consumeSigningOtp(locked.context, command)).rejects.toBe(OtpLockedException)

    const mismatch = setup(validOtp(), false)
    await expect(mismatch.adapter.consumeSigningOtp(mismatch.context, command)).rejects.toBe(InvalidOTPException)
    expect(mismatch.tx.otpRequest.deleteMany).not.toHaveBeenCalled()
  })

  it('atomically consumes one valid OTP and rejects a lost delete race', async () => {
    const success = setup(validOtp())
    await expect(success.adapter.consumeSigningOtp(success.context, command)).resolves.toBeUndefined()
    expect(success.tx.otpRequest.deleteMany).toHaveBeenCalledWith({
      where: {
        id: validOtp().id,
        purpose: command.purpose,
        isUsed: false,
        expiresAt: { gt: expect.any(Date) }
      }
    })

    const raced = setup(validOtp(), true, 0)
    await expect(raced.adapter.consumeSigningOtp(raced.context, command)).rejects.toBe(InvalidOTPException)
  })
})
