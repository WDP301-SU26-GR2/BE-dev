// Centralized messages emitted by the security layer (auth/role guards).
// Plain strings only. `mustChangePassword` is an `Error.*` code FE maps to text;
// the others are literal guard messages kept as-is for backward compatibility.
export const SecurityMessages = {
  accessTokenRequired: 'Access token is required',
  invalidAccessToken: 'Invalid access token',
  unauthorized: 'Unauthorized',
  mustChangePassword: 'Error.MustChangePassword',
  otpRateLimited: 'Error.OtpRateLimited',
  publicRateLimited: 'Error.PublicRateLimited',
  forbiddenResource: 'You do not have permission to access this resource',
  error: {
    accessTokenRequired: 'Access token is required',
    invalidAccessToken: 'Invalid access token',
    unauthorized: 'Unauthorized',
    mustChangePassword: 'Error.MustChangePassword',
    otpRateLimited: 'Error.OtpRateLimited',
    publicRateLimited: 'Error.PublicRateLimited',
    forbiddenResource: 'You do not have permission to access this resource'
  },
  errorText: {
    'Access token is required': 'Vui lòng cung cấp access token',
    'Invalid access token': 'Access token không hợp lệ',
    Unauthorized: 'Bạn chưa đăng nhập hoặc phiên đăng nhập đã hết hạn',
    'Error.MustChangePassword': 'Bạn cần đổi mật khẩu trước khi tiếp tục',
    'Error.OtpRateLimited': 'Bạn thao tác quá nhanh — vui lòng thử lại sau',
    'Error.PublicRateLimited': 'Bạn thao tác quá nhanh — vui lòng thử lại sau',
    AUTH_OTP_RATE_LIMITED: 'Bạn thao tác quá nhanh — vui lòng thử lại sau',
    PUBLIC_RATE_LIMITED: 'Bạn thao tác quá nhanh — vui lòng thử lại sau',
    'You do not have permission to access this resource': 'Bạn không có quyền truy cập tài nguyên này'
  }
} as const
