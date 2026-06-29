export const RoleName = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  MANGAKA: 'MANGAKA',
  ASSISTANT: 'ASSISTANT',
  EDITOR: 'EDITOR',
  BOARD_MEMBER: 'BOARD_MEMBER'
} as const
export type RoleNameType = (typeof RoleName)[keyof typeof RoleName]
