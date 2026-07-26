import { UserStatus } from 'src/core/models/user.model'
import { OtpPurpose } from '../auth.constant'
import { AuthMessages } from '../auth.messages'
import { AccountBannedException, EmailNotFoundException, InvalidPasswordException } from '../errors/auth.errors'
import { AuthPasswordService } from './auth-password.service'

function setup() {
  const repository = {
    findUserWithRole: jest.fn(),
    updateUserPassword: jest.fn().mockResolvedValue(undefined),
    deleteOtpRequest: jest.fn().mockResolvedValue(undefined),
    deleteRefreshTokensByUserId: jest.fn().mockResolvedValue(undefined)
  }
  const hashing = {
    compare: jest.fn().mockResolvedValue(true),
    hash: jest.fn().mockResolvedValue('new-hash')
  }
  const otp = {
    validateOtpCode: jest.fn().mockResolvedValue(undefined)
  }
  return {
    repository,
    hashing,
    otp,
    service: new AuthPasswordService(repository as never, hashing, otp as never)
  }
}

const existingUser = (overrides: Record<string, unknown> = {}) => ({
  id: 'user-1',
  email: 'user@example.com',
  password: 'old-hash',
  status: UserStatus.ACTIVE,
  ...overrides
})

describe('AuthPasswordService credential reset security', () => {
  const forgotBody = {
    email: 'user@example.com',
    code: '123456',
    newPassword: 'NewPassword123!',
    confirmNewPassword: 'NewPassword123!'
  }

  it('validates reset OTP before replacing the password and revoking every session', async () => {
    const fixture = setup()
    fixture.repository.findUserWithRole.mockResolvedValue(existingUser())

    await expect(fixture.service.forgotPasswordService(forgotBody)).resolves.toEqual({
      message: AuthMessages.response.passwordReset
    })
    expect(fixture.otp.validateOtpCode).toHaveBeenCalledWith({
      email: forgotBody.email,
      code: forgotBody.code,
      purpose: OtpPurpose.FORGOT_PASSWORD
    })
    expect(fixture.hashing.hash).toHaveBeenCalledWith(forgotBody.newPassword)
    expect(fixture.repository.updateUserPassword).toHaveBeenCalledWith('user-1', 'new-hash')
    expect(fixture.repository.deleteOtpRequest).toHaveBeenCalledWith({
      email: forgotBody.email,
      purpose: OtpPurpose.FORGOT_PASSWORD
    })
    expect(fixture.repository.deleteRefreshTokensByUserId).toHaveBeenCalledWith('user-1')
  })

  it('rejects an unknown reset identity without validating OTP or hashing a password', async () => {
    const fixture = setup()
    fixture.repository.findUserWithRole.mockResolvedValue(null)

    await expect(fixture.service.forgotPasswordService(forgotBody)).rejects.toBe(EmailNotFoundException)
    expect(fixture.otp.validateOtpCode).not.toHaveBeenCalled()
    expect(fixture.hashing.hash).not.toHaveBeenCalled()
  })

  it.each([UserStatus.BANNED, UserStatus.BLOCKED])('blocks password reset for %s accounts', async (status) => {
    const fixture = setup()
    fixture.repository.findUserWithRole.mockResolvedValue(existingUser({ status }))

    await expect(fixture.service.forgotPasswordService(forgotBody)).rejects.toBe(AccountBannedException)
    expect(fixture.otp.validateOtpCode).not.toHaveBeenCalled()
  })

  it('does not mutate credentials when OTP validation fails', async () => {
    const fixture = setup()
    const invalidOtp = new Error('invalid otp')
    fixture.repository.findUserWithRole.mockResolvedValue(existingUser())
    fixture.otp.validateOtpCode.mockRejectedValue(invalidOtp)

    await expect(fixture.service.forgotPasswordService(forgotBody)).rejects.toBe(invalidOtp)
    expect(fixture.hashing.hash).not.toHaveBeenCalled()
    expect(fixture.repository.updateUserPassword).not.toHaveBeenCalled()
  })

  it('changes a known user password only after comparing the current credential and revokes sessions', async () => {
    const fixture = setup()
    fixture.repository.findUserWithRole.mockResolvedValue(existingUser())
    const body = {
      currentPassword: 'old-password',
      newPassword: 'NewPassword123!',
      confirmNewPassword: 'NewPassword123!'
    }

    await expect(fixture.service.changePasswordService(body, 'user-1')).resolves.toEqual({
      message: AuthMessages.response.passwordChanged
    })
    expect(fixture.hashing.compare).toHaveBeenCalledWith('old-password', 'old-hash')
    expect(fixture.hashing.hash).toHaveBeenCalledWith('NewPassword123!')
    expect(fixture.repository.updateUserPassword).toHaveBeenCalledWith('user-1', 'new-hash')
    expect(fixture.repository.deleteRefreshTokensByUserId).toHaveBeenCalledWith('user-1')
  })

  it('rejects change password for a missing user before credential comparison', async () => {
    const fixture = setup()
    fixture.repository.findUserWithRole.mockResolvedValue(null)

    await expect(
      fixture.service.changePasswordService(
        {
          currentPassword: 'old-password',
          newPassword: 'NewPassword123!',
          confirmNewPassword: 'NewPassword123!'
        },
        'missing'
      )
    ).rejects.toBe(EmailNotFoundException)
    expect(fixture.hashing.compare).not.toHaveBeenCalled()
  })

  it('rejects an incorrect current password without hashing or revoking sessions', async () => {
    const fixture = setup()
    fixture.repository.findUserWithRole.mockResolvedValue(existingUser())
    fixture.hashing.compare.mockResolvedValue(false)

    await expect(
      fixture.service.changePasswordService(
        {
          currentPassword: 'wrong-password',
          newPassword: 'NewPassword123!',
          confirmNewPassword: 'NewPassword123!'
        },
        'user-1'
      )
    ).rejects.toBe(InvalidPasswordException)
    expect(fixture.hashing.hash).not.toHaveBeenCalled()
    expect(fixture.repository.deleteRefreshTokensByUserId).not.toHaveBeenCalled()
  })
})
