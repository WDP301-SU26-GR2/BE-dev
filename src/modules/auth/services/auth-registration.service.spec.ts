import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'
import { UserStatus } from 'src/core/models/user.model'
import { OtpPurpose } from '../auth.constant'
import { AuthMessages } from '../auth.messages'
import { EmailAlreadyVerifiedException, EmailConflictException, EmailNotFoundException } from '../errors/auth.errors'
import { AuthRegistrationService } from './auth-registration.service'

function setup() {
  const repository = {
    createUser: jest.fn().mockResolvedValue({ id: 'user-1' }),
    findUserByEmail: jest.fn(),
    activateUser: jest.fn().mockResolvedValue(undefined),
    deleteOtpRequest: jest.fn().mockResolvedValue(undefined)
  }
  const hashing = {
    hash: jest.fn().mockResolvedValue('password-hash')
  }
  const otp = {
    issueOtp: jest.fn().mockResolvedValue(undefined),
    validateOtpCode: jest.fn().mockResolvedValue(undefined)
  }
  const roles = {
    getRoleIdByCode: jest.fn().mockResolvedValue('role-1')
  }
  return {
    repository,
    hashing,
    otp,
    roles,
    service: new AuthRegistrationService(repository as never, hashing as never, otp as never, roles as never)
  }
}

describe('AuthRegistrationService identity lifecycle', () => {
  const registerBody = {
    email: 'new@example.com',
    name: 'New User',
    displayName: 'Pen Name',
    phoneNumber: '+84912345678',
    password: 'Secret123!',
    type: 'MANGAKA'
  }

  it('creates an inactive account with a hashed password before issuing registration OTP', async () => {
    const fixture = setup()

    await expect(fixture.service.registerService(registerBody as never)).resolves.toEqual({
      message: AuthMessages.response.registered
    })
    expect(fixture.roles.getRoleIdByCode).toHaveBeenCalledWith('MANGAKA')
    expect(fixture.hashing.hash).toHaveBeenCalledWith('Secret123!')
    expect(fixture.repository.createUser).toHaveBeenCalledWith({
      email: 'new@example.com',
      name: 'New User',
      displayName: 'Pen Name',
      phoneNumber: '+84912345678',
      password: 'password-hash',
      roleId: 'role-1',
      status: UserStatus.INACTIVE
    })
    expect(fixture.otp.issueOtp).toHaveBeenCalledWith('new@example.com', OtpPurpose.REGISTER)
  })

  it('maps unique email races to the public conflict error without issuing OTP', async () => {
    const fixture = setup()
    fixture.repository.createUser.mockRejectedValue(
      new PrismaClientKnownRequestError('duplicate email', { code: 'P2002', clientVersion: 'test' })
    )

    await expect(fixture.service.registerService(registerBody as never)).rejects.toBe(EmailConflictException)
    expect(fixture.otp.issueOtp).not.toHaveBeenCalled()
  })

  it('preserves non-unique persistence failures and does not issue OTP', async () => {
    const fixture = setup()
    const failure = new Error('database unavailable')
    fixture.repository.createUser.mockRejectedValue(failure)

    await expect(fixture.service.registerService(registerBody as never)).rejects.toBe(failure)
    expect(fixture.otp.issueOtp).not.toHaveBeenCalled()
  })

  it('validates registration OTP before activating the user and consuming the OTP', async () => {
    const fixture = setup()
    fixture.repository.findUserByEmail.mockResolvedValue({ id: 'user-1', emailVerified: false })
    const body = { email: 'new@example.com', code: '123456' }

    await expect(fixture.service.verifyEmailService(body)).resolves.toEqual({
      message: AuthMessages.response.emailVerified
    })
    expect(fixture.otp.validateOtpCode).toHaveBeenCalledWith({
      email: 'new@example.com',
      code: '123456',
      purpose: OtpPurpose.REGISTER
    })
    expect(fixture.repository.activateUser).toHaveBeenCalledWith('user-1')
    expect(fixture.repository.deleteOtpRequest).toHaveBeenCalledWith({
      email: 'new@example.com',
      purpose: OtpPurpose.REGISTER
    })
  })

  it('rejects verification when the account does not exist', async () => {
    const fixture = setup()
    fixture.repository.findUserByEmail.mockResolvedValue(null)

    await expect(fixture.service.verifyEmailService({ email: 'missing@example.com', code: '123456' })).rejects.toBe(
      EmailNotFoundException
    )
    expect(fixture.otp.validateOtpCode).not.toHaveBeenCalled()
  })

  it('rejects replayed verification for an already verified account', async () => {
    const fixture = setup()
    fixture.repository.findUserByEmail.mockResolvedValue({ id: 'user-1', emailVerified: true })

    await expect(fixture.service.verifyEmailService({ email: 'new@example.com', code: '123456' })).rejects.toBe(
      EmailAlreadyVerifiedException
    )
    expect(fixture.otp.validateOtpCode).not.toHaveBeenCalled()
  })

  it('does not activate or consume OTP when verification fails', async () => {
    const fixture = setup()
    const invalidOtp = new Error('invalid otp')
    fixture.repository.findUserByEmail.mockResolvedValue({ id: 'user-1', emailVerified: false })
    fixture.otp.validateOtpCode.mockRejectedValue(invalidOtp)

    await expect(fixture.service.verifyEmailService({ email: 'new@example.com', code: 'wrong' })).rejects.toBe(
      invalidOtp
    )
    expect(fixture.repository.activateUser).not.toHaveBeenCalled()
    expect(fixture.repository.deleteOtpRequest).not.toHaveBeenCalled()
  })
})
