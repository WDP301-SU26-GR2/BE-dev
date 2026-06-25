import { AuthGoogleService } from './auth-google.service'
import { UserStatus } from 'src/core/models/user.model'
import {
  AccountBannedException,
  EmailNotVerifiedException,
  GoogleAccountMismatchException,
  GoogleAccountNotRegisteredException,
  GoogleEmailNotVerifiedException,
  InvalidGoogleTokenException
} from '../errors/auth.errors'

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'u1',
    email: 'user@x.com',
    name: 'User',
    displayName: null,
    phoneNumber: '0123456789',
    status: UserStatus.ACTIVE,
    emailVerified: true,
    googleId: null,
    mustChangePassword: false,
    role: { code: 'MANGAKA' },
    ...overrides
  }
}

describe('AuthGoogleService', () => {
  let verifier: { verify: jest.Mock }
  let repo: { findUserWithRole: jest.Mock; setGoogleId: jest.Mock }
  let tokenService: { issueSession: jest.Mock }
  let service: AuthGoogleService

  const validPayload = { email: 'user@x.com', emailVerified: true, sub: 'google-sub-1' }
  const session = { user: { id: 'u1' }, accessToken: 'a', refreshToken: 'r', mustChangePassword: false }

  beforeEach(() => {
    verifier = { verify: jest.fn().mockResolvedValue(validPayload) }
    repo = { findUserWithRole: jest.fn(), setGoogleId: jest.fn().mockResolvedValue(undefined) }
    tokenService = { issueSession: jest.fn().mockResolvedValue(session) }
    service = new AuthGoogleService(verifier as never, repo as never, tokenService as never)
  })

  it('links googleId on first Google login and returns a session', async () => {
    repo.findUserWithRole.mockResolvedValue(makeUser({ googleId: null }))
    const result = await service.googleLoginService({ idToken: 'tok' })
    expect(repo.setGoogleId).toHaveBeenCalledWith('u1', 'google-sub-1')
    expect(result).toBe(session)
  })

  it('returns a session without re-linking when googleId already matches', async () => {
    repo.findUserWithRole.mockResolvedValue(makeUser({ googleId: 'google-sub-1' }))
    const result = await service.googleLoginService({ idToken: 'tok' })
    expect(repo.setGoogleId).not.toHaveBeenCalled()
    expect(result).toBe(session)
  })

  it('rejects when no account matches the Google email', async () => {
    repo.findUserWithRole.mockResolvedValue(null)
    await expect(service.googleLoginService({ idToken: 'tok' })).rejects.toBe(GoogleAccountNotRegisteredException)
  })

  it('rejects when the account has not verified its email yet', async () => {
    repo.findUserWithRole.mockResolvedValue(makeUser({ status: UserStatus.INACTIVE, emailVerified: false }))
    await expect(service.googleLoginService({ idToken: 'tok' })).rejects.toBe(EmailNotVerifiedException)
  })

  it('rejects banned accounts', async () => {
    repo.findUserWithRole.mockResolvedValue(makeUser({ status: UserStatus.BANNED }))
    await expect(service.googleLoginService({ idToken: 'tok' })).rejects.toBe(AccountBannedException)
  })

  it('rejects when Google has not verified the email', async () => {
    verifier.verify.mockResolvedValue({ ...validPayload, emailVerified: false })
    await expect(service.googleLoginService({ idToken: 'tok' })).rejects.toBe(GoogleEmailNotVerifiedException)
  })

  it('rejects an invalid Google token', async () => {
    verifier.verify.mockRejectedValue(new Error('bad token'))
    await expect(service.googleLoginService({ idToken: 'tok' })).rejects.toBe(InvalidGoogleTokenException)
  })

  it('rejects when a different Google account claims the same email', async () => {
    repo.findUserWithRole.mockResolvedValue(makeUser({ googleId: 'other-sub' }))
    await expect(service.googleLoginService({ idToken: 'tok' })).rejects.toBe(GoogleAccountMismatchException)
  })
})
