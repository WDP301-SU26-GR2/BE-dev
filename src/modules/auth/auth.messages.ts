// Centralized user-facing messages for the auth module — single source of truth.
// Plain strings only (no NestJS imports). HTTP mapping (status + path) stays in
// `errors/auth.errors.ts`, which references the `error` codes below.
export const AuthMessages = {
  // Success messages returned to the client (response layer).
  response: {
    otpSent: 'Đã gửi mã OTP',
    registered: 'Đăng ký thành công — vui lòng xác thực email bằng mã OTP đã gửi',
    emailVerified: 'Xác thực email thành công — tài khoản đã được kích hoạt',
    passwordReset: 'Đặt lại mật khẩu thành công',
    passwordChanged: 'Đổi mật khẩu thành công',
    loggedOut: 'Đăng xuất thành công'
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
  },
  errorText: {
    'Error.InvalidOTP': 'Mã OTP không đúng',
    'Error.OTPExpired': 'Mã OTP đã hết hạn — vui lòng xin mã mới',
    'Error.OTPLocked': 'Mã OTP đã bị khoá do nhập sai quá nhiều lần',
    'Error.FailedToSendOTP': 'Không thể gửi mã OTP — vui lòng thử lại',
    'Error.EmailAlreadyExists': 'Email này đã được đăng ký',
    'Error.EmailNotFound': 'Không tìm thấy tài khoản với email này',
    'Error.EmailAlreadyVerified': 'Email này đã được xác thực',
    'Error.EmailNotVerified': 'Tài khoản chưa xác thực email',
    'Error.InvalidPassword': 'Mật khẩu không đúng',
    'Error.RefreshTokenAlreadyUsed': 'Phiên đăng nhập đã được sử dụng — vui lòng đăng nhập lại',
    'Error.UnauthorizedAccess': 'Bạn chưa đăng nhập hoặc phiên đăng nhập đã hết hạn',
    'Error.AccountBanned': 'Tài khoản đã bị cấm',
    'Error.InvalidGoogleToken': 'Thông tin đăng nhập Google không hợp lệ',
    'Error.GoogleEmailNotVerified': 'Email Google chưa được xác thực',
    'Error.GoogleAccountNotRegistered': 'Tài khoản Google này chưa được đăng ký',
    'Error.GoogleAccountMismatch': 'Tài khoản Google không khớp với tài khoản hiện tại',
    'Error.TOTPAlreadyEnabled': 'Xác thực hai bước đã được bật',
    'Error.TOTPNotEnabled': 'Xác thực hai bước chưa được bật',
    'Error.InvalidTOTP': 'Mã xác thực hai bước không đúng',
    'Error.InvalidTOTPAndCode': 'Mã xác thực hai bước và mã dự phòng không đúng'
  }
} as const
