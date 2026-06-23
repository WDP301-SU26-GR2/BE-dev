import { ExecutionContext, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { REQUEST_USER_KEY } from '../auth-type'
import { PasswordPolicyGuard } from './password-policy.guard'

function makeContext(user: unknown): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ [REQUEST_USER_KEY]: user })
    })
  } as unknown as ExecutionContext
}

function makeGuard(skip: boolean): PasswordPolicyGuard {
  const reflector = {
    getAllAndOverride: () => skip
  } as unknown as Reflector
  return new PasswordPolicyGuard(reflector)
}

describe('PasswordPolicyGuard', () => {
  it('allows when no user is attached', () => {
    expect(makeGuard(false).canActivate(makeContext(undefined))).toBe(true)
  })

  it('allows when mustChangePassword is false', () => {
    expect(makeGuard(false).canActivate(makeContext({ userId: '1', mustChangePassword: false }))).toBe(true)
  })

  it('allows skipped routes even when mustChangePassword is true', () => {
    expect(makeGuard(true).canActivate(makeContext({ userId: '1', mustChangePassword: true }))).toBe(true)
  })

  it('throws 403 when mustChangePassword is true and route is not skipped', () => {
    expect(() => makeGuard(false).canActivate(makeContext({ userId: '1', mustChangePassword: true }))).toThrow(
      ForbiddenException
    )
  })
})
