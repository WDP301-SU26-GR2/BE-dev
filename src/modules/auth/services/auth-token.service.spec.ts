import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'
import { UserStatus } from 'src/core/models/user.model'
import { AuthMessages } from '../auth.messages'
import {
  AccountBannedException,
  EmailNotFoundException,
  EmailNotVerifiedException,
  InvalidPasswordException,
  RefreshTokenAlreadyUsedException,
  UnauthorizedAccessException
} from '../errors/auth.errors'
import { AuthTokenService } from './auth-token.service'

function prismaError(code: string) {
  return new PrismaClientKnownRequestError(code, { code, clientVersion: 'test' })
}

function user(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    email: 'user@example.com',
    name: 'User',
    displayName: null,
    phoneNumber: '+84912345678',
    password: 'hash',
    status: UserStatus.ACTIVE,
    emailVerified: true,
    mustChangePassword: false,
    role: { code: 'MANGAKA' },
    ...overrides
  }
}

function setup() {
  const repository = {
    findUserWithRole: jest.fn(),
    deleteRefreshToken: jest.fn().mockResolvedValue(undefined),
    createRefreshToken: jest.fn().mockResolvedValue(undefined)
  }
  const hashing = {
    compare: jest.fn().mockResolvedValue(true)
  }
  const tokens = {
    verifyRefreshToken: jest.fn().mockResolvedValue({ userId: 'user-1' }),
    signAccessToken: jest.fn().mockResolvedValue('access-token'),
    signRefreshToken: jest.fn().mockResolvedValue('refresh-token'),
    decodeRefreshToken: jest.fn().mockReturnValue({ exp: 2_000_000_000 })
  }
  return {
    repository,
    hashing,
    tokens,
    service: new AuthTokenService(repository as never, hashing as never, tokens as never)
  }
}

describe('AuthTokenService security and refresh rotation', () => {
  it('issues and persists a complete session only after valid credentials', async () => {
    const fixture = setup()
    fixture.repository.findUserWithRole.mockResolvedValue(user({ displayName: 'Pen Name', mustChangePassword: true }))

    await expect(fixture.service.loginService({ email: 'user@example.com', password: 'secret' })).resolves.toEqual({
      user: {
        id: 'user-1',
        email: 'user@example.com',
        name: 'User',
        displayName: 'Pen Name',
        phoneNumber: '+84912345678',
        role: 'MANGAKA'
      },
      mustChangePassword: true,
      accessToken: 'access-token',
      refreshToken: 'refresh-token'
    })
    expect(fixture.hashing.compare).toHaveBeenCalledWith('secret', 'hash')
    expect(fixture.tokens.signAccessToken).toHaveBeenCalledWith({
      userId: 'user-1',
      email: 'user@example.com',
      roleName: 'MANGAKA',
      mustChangePassword: true
    })
    expect(fixture.repository.createRefreshToken).toHaveBeenCalledWith({
      token: 'refresh-token',
      userId: 'user-1',
      expiresAt: new Date(2_000_000_000_000)
    })
  })

  it('does not run password hashing or token issuance for an unknown email', async () => {
    const fixture = setup()
    fixture.repository.findUserWithRole.mockResolvedValue(null)

    await expect(fixture.service.loginService({ email: 'missing@example.com', password: 'secret' })).rejects.toBe(
      EmailNotFoundException
    )
    expect(fixture.hashing.compare).not.toHaveBeenCalled()
    expect(fixture.tokens.signAccessToken).not.toHaveBeenCalled()
  })

  it.each([UserStatus.BANNED, UserStatus.BLOCKED])('blocks %s accounts before comparing passwords', async (status) => {
    const fixture = setup()
    fixture.repository.findUserWithRole.mockResolvedValue(user({ status }))

    await expect(fixture.service.loginService({ email: 'user@example.com', password: 'secret' })).rejects.toBe(
      AccountBannedException
    )
    expect(fixture.hashing.compare).not.toHaveBeenCalled()
  })

  it('rejects a password mismatch without issuing tokens', async () => {
    const fixture = setup()
    fixture.repository.findUserWithRole.mockResolvedValue(user())
    fixture.hashing.compare.mockResolvedValue(false)

    await expect(fixture.service.loginService({ email: 'user@example.com', password: 'wrong' })).rejects.toBe(
      InvalidPasswordException
    )
    expect(fixture.tokens.signAccessToken).not.toHaveBeenCalled()
  })

  it.each([
    { emailVerified: false, status: UserStatus.ACTIVE },
    { emailVerified: true, status: UserStatus.INACTIVE }
  ])('requires both verified email and ACTIVE status: %#', async (state) => {
    const fixture = setup()
    fixture.repository.findUserWithRole.mockResolvedValue(user(state))

    await expect(fixture.service.loginService({ email: 'user@example.com', password: 'secret' })).rejects.toBe(
      EmailNotVerifiedException
    )
    expect(fixture.tokens.signAccessToken).not.toHaveBeenCalled()
  })

  it('logs out only after verifying and deleting the supplied refresh token', async () => {
    const fixture = setup()

    await expect(fixture.service.logoutService({ refreshToken: 'refresh-token' })).resolves.toEqual({
      message: AuthMessages.response.loggedOut
    })
    expect(fixture.tokens.verifyRefreshToken).toHaveBeenCalledWith('refresh-token')
    expect(fixture.repository.deleteRefreshToken).toHaveBeenCalledWith('refresh-token')
  })

  it('does not touch storage for an invalid logout token', async () => {
    const fixture = setup()
    fixture.tokens.verifyRefreshToken.mockRejectedValue(new Error('invalid signature'))

    await expect(fixture.service.logoutService({ refreshToken: 'forged' })).rejects.toBe(UnauthorizedAccessException)
    expect(fixture.repository.deleteRefreshToken).not.toHaveBeenCalled()
  })

  it('maps a missing logout token row to replay detection and preserves other database failures', async () => {
    const replayed = setup()
    replayed.repository.deleteRefreshToken.mockRejectedValue(prismaError('P2025'))
    await expect(replayed.service.logoutService({ refreshToken: 'replayed' })).rejects.toBe(
      RefreshTokenAlreadyUsedException
    )

    const unavailable = setup()
    const failure = new Error('database unavailable')
    unavailable.repository.deleteRefreshToken.mockRejectedValue(failure)
    await expect(unavailable.service.logoutService({ refreshToken: 'valid' })).rejects.toBe(failure)
  })

  it('rotates a refresh token by consuming it before loading and issuing the replacement session', async () => {
    const fixture = setup()
    fixture.repository.findUserWithRole.mockResolvedValue(user())

    await expect(fixture.service.refreshTokenService({ refreshToken: 'old-token' })).resolves.toMatchObject({
      accessToken: 'access-token',
      refreshToken: 'refresh-token'
    })
    expect(fixture.repository.deleteRefreshToken).toHaveBeenCalledWith('old-token')
    expect(fixture.repository.findUserWithRole).toHaveBeenCalledWith({ id: 'user-1' })
  })

  it('rejects invalid refresh signatures without consuming anything', async () => {
    const fixture = setup()
    fixture.tokens.verifyRefreshToken.mockRejectedValue(new Error('expired'))

    await expect(fixture.service.refreshTokenService({ refreshToken: 'expired' })).rejects.toBe(
      UnauthorizedAccessException
    )
    expect(fixture.repository.deleteRefreshToken).not.toHaveBeenCalled()
  })

  it('detects refresh replay and preserves unexpected consume failures', async () => {
    const replayed = setup()
    replayed.repository.deleteRefreshToken.mockRejectedValue(prismaError('P2025'))
    await expect(replayed.service.refreshTokenService({ refreshToken: 'replayed' })).rejects.toBe(
      RefreshTokenAlreadyUsedException
    )
    expect(replayed.repository.findUserWithRole).not.toHaveBeenCalled()

    const unavailable = setup()
    const failure = new Error('database unavailable')
    unavailable.repository.deleteRefreshToken.mockRejectedValue(failure)
    await expect(unavailable.service.refreshTokenService({ refreshToken: 'valid' })).rejects.toBe(failure)
  })

  it('rejects a refresh token whose user disappeared after token consumption', async () => {
    const fixture = setup()
    fixture.repository.findUserWithRole.mockResolvedValue(null)

    await expect(fixture.service.refreshTokenService({ refreshToken: 'valid' })).rejects.toBe(
      UnauthorizedAccessException
    )
    expect(fixture.tokens.signAccessToken).not.toHaveBeenCalled()
  })

  it.each([UserStatus.BANNED, UserStatus.BLOCKED])('blocks refresh for a %s account', async (status) => {
    const fixture = setup()
    fixture.repository.findUserWithRole.mockResolvedValue(user({ status }))

    await expect(fixture.service.refreshTokenService({ refreshToken: 'valid' })).rejects.toBe(AccountBannedException)
    expect(fixture.tokens.signAccessToken).not.toHaveBeenCalled()
  })

  it.each([
    { emailVerified: false, status: UserStatus.ACTIVE },
    { emailVerified: true, status: UserStatus.INACTIVE }
  ])('blocks refresh when account activation is incomplete: %#', async (state) => {
    const fixture = setup()
    fixture.repository.findUserWithRole.mockResolvedValue(user(state))

    await expect(fixture.service.refreshTokenService({ refreshToken: 'valid' })).rejects.toBe(EmailNotVerifiedException)
  })
})
