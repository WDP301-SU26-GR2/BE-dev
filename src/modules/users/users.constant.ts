import { RoleName } from 'src/core/security/role.constant'

export const ADMIN_CREATABLE_ROLES = [RoleName.EDITOR, RoleName.BOARD_MEMBER] as const
export type AdminCreatableRole = (typeof ADMIN_CREATABLE_ROLES)[number]
