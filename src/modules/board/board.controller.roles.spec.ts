import 'reflect-metadata'
import { BoardController } from './board.controller'
import { ROLES_KEY } from 'src/core/security/decorators/roles.decorator'
import { RoleName } from 'src/core/security/constants/role.constant'

// Security fix: PATCH /board/sessions/:id/start must be role-guarded (was missing @Roles →
// any authenticated user could activate a Board session). Restrict to EDITOR + SUPER_ADMIN,
// matching who can create a session (POST /board/sessions).
describe('BoardController RBAC', () => {
  it('guards startSession with @Roles(EDITOR, SUPER_ADMIN)', () => {
    // Read via descriptor.value to avoid an unbound-method reference; @Roles attaches metadata to the handler fn.
    const handler = Object.getOwnPropertyDescriptor(BoardController.prototype, 'startSession')?.value as object
    const roles = Reflect.getMetadata(ROLES_KEY, handler)
    expect(roles).toEqual([RoleName.EDITOR, RoleName.SUPER_ADMIN])
  })

  it('guards concludeSession with @Roles(EDITOR, SUPER_ADMIN)', () => {
    const handler = Object.getOwnPropertyDescriptor(BoardController.prototype, 'concludeSession')?.value as object
    const roles = Reflect.getMetadata(ROLES_KEY, handler)
    expect(roles).toEqual([RoleName.EDITOR, RoleName.SUPER_ADMIN])
  })
})
