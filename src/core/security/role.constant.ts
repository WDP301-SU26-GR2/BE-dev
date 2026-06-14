export const RoleName = {
  ADMIN: 'ADMIN',
  MANGAKA: 'MANGAKA',
  ASSISTANT: 'ASSISTANT',
  MEMBER_BOARD: 'MEMBER_BOARD',
  TANTOU_EDITOR: 'TANTOU_EDITOR'
} as const
export type RoleNameType = (typeof RoleName)[keyof typeof RoleName]
