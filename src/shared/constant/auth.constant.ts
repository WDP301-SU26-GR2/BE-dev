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
