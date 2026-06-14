export const OtpPurpose = {
  REGISTER: 'REGISTER',
  FORGOT_PASSWORD: 'FORGOT_PASSWORD',
  SIGNING_CONTRACT: 'SIGNING_CONTRACT'
} as const
export type OtpPurposeType = (typeof OtpPurpose)[keyof typeof OtpPurpose]
