import { ExecutionContext, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { REQUEST_USER_KEY } from '../auth-type'
import { RolesGuard } from './roles.guard'

function makeContext(user: unknown): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ [REQUEST_USER_KEY]: user })
    })
  } as unknown as ExecutionContext
}

function makeGuard(roles: string[] | undefined): RolesGuard {
  const reflector = {
    getAllAndOverride: () => roles
  } as unknown as Reflector
  return new RolesGuard(reflector)
}

describe('RolesGuard', () => {
  it('allows routes without @Roles()', () => {
    const guard = makeGuard(undefined)

    expect(guard.canActivate(makeContext({ userId: '1', roleName: 'ADMIN' }))).toBe(true)
  })

  it('allows users whose roleName is included in @Roles()', () => {
    const guard = makeGuard(['ADMIN', 'TANTOU_EDITOR'])

    expect(guard.canActivate(makeContext({ userId: '1', roleName: 'ADMIN' }))).toBe(true)
  })

  it('throws 403 when roleName is not included in @Roles()', () => {
    const guard = makeGuard(['ADMIN'])

    expect(() => guard.canActivate(makeContext({ userId: '1', roleName: 'MANGAKA' }))).toThrow(ForbiddenException)
  })

  it('throws 403 when request user is missing', () => {
    const guard = makeGuard(['ADMIN'])

    expect(() => guard.canActivate(makeContext(undefined))).toThrow(ForbiddenException)
  })
})
