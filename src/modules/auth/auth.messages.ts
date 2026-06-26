// Centralized user-facing messages for the auth module — single source of truth.
// Plain strings only (no NestJS imports). HTTP mapping (status + path) stays in
// `errors/auth.errors.ts`, which references the `error` codes below.
export const AuthMessages = {
  // Success messages returned to the client (response layer).
  response: {
    otpSent: 'OTP sent successfully',
    registered: 'Registered. Please verify your email with the OTP sent.',
    emailVerified: 'Email verified. Your account is now active.',
    passwordReset: 'Password reset successfully',
    passwordChanged: 'Password changed successfully',
    loggedOut: 'Logout successfully'
  },
  // Error codes (FE maps these keys to localized text). Consumed by errors/auth.errors.ts.
  error: {
    invalidOtp: 'Error.InvalidOTP',
    otpExpired: 'Error.OTPExpired',
    otpLocked: 'Error.OTPLocked',
    failedToSendOtp: 'Error.FailedToSendOTP',
    emailAlreadyExists: 'Error.EmailAlreadyExists',
    emailNotFound: 'Error.EmailNotFound',
    emailAlreadyVerified: 'Error.EmailAlreadyVerified',
    emailNotVerified: 'Error.EmailNotVerified',
    invalidPassword: 'Error.InvalidPassword',
    refreshTokenAlreadyUsed: 'Error.RefreshTokenAlreadyUsed',
    unauthorizedAccess: 'Error.UnauthorizedAccess',
    accountBanned: 'Error.AccountBanned',
    invalidGoogleToken: 'Error.InvalidGoogleToken',
    googleEmailNotVerified: 'Error.GoogleEmailNotVerified',
    googleAccountNotRegistered: 'Error.GoogleAccountNotRegistered',
    googleAccountMismatch: 'Error.GoogleAccountMismatch',
    totpAlreadyEnabled: 'Error.TOTPAlreadyEnabled',
    totpNotEnabled: 'Error.TOTPNotEnabled',
    invalidTotp: 'Error.InvalidTOTP',
    invalidTotpAndCode: 'Error.InvalidTOTPAndCode'
  }
} as const
