// Centralized user-facing messages for the auth module.
// Keep all human-readable copy here so it is easy to review/adjust/i18n later.
// (Error codes live in `errors/auth.errors.ts` as `Error.*` keys — those stay there.)
export const AuthMessages = {
  // Success messages returned to the client (response layer).
  response: {
    otpSent: 'OTP sent successfully',
    registered: 'Registered. Please verify your email with the OTP sent.',
    emailVerified: 'Email verified. Your account is now active.',
    passwordReset: 'Password reset successfully',
    passwordChanged: 'Password changed successfully',
    loggedOut: 'Logout successfully'
  }
} as const
