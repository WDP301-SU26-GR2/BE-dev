export const OtpPurpose = {
  REGISTER: 'REGISTER',
  FORGOT_PASSWORD: 'FORGOT_PASSWORD',
  SIGNING_CONTRACT: 'SIGNING_CONTRACT'
} as const
export type OtpPurposeType = (typeof OtpPurpose)[keyof typeof OtpPurpose]

export const AUTH_OTP_MAX_ATTEMPTS = 5
// OTP TTL is configurable via env `OTP_EXPIRES_IN` (e.g. "5m"); parsed in AuthOtpService.
