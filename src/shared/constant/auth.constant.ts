export const REQUEST_USER_KEY = 'user' as const

export const AuthType = {
  Bearer: 'Bearer',
  None: 'None' //ko áp dụng cors nào cả, có thể dùng cho các route ko cần xác thực, hoặc có thể dùng để tắt xác thực cho toàn bộ ứng dụng nếu muốn
} as const
export type AuthTypeType = (typeof AuthType)[keyof typeof AuthType]

export const ConditionGuard = {
  Or: 'Or',
  And: 'And'
} as const
export type ConditionGuardType = (typeof ConditionGuard)[keyof typeof ConditionGuard]

export const UserStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  BANNED: 'BANNED',
  BLOCKED: 'BLOCKED'
} as const
export type UserStatusType = (typeof UserStatus)[keyof typeof UserStatus]

export const OtpPurpose = {
  REGISTER: 'REGISTER',
  FORGOT_PASSWORD: 'FORGOT_PASSWORD',
  SIGNING_CONTRACT: 'SIGNING_CONTRACT'
} as const
export type OtpPurposeType = (typeof OtpPurpose)[keyof typeof OtpPurpose]
