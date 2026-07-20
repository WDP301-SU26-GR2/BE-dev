// Centralized messages emitted by the security layer (auth/role guards).
// Plain strings only. Mọi mã đều theo convention `Error.PascalCase` (AGENTS §7) — chuỗi ném ra CHÍNH LÀ
// `code` mà FE phân nhánh, `errorText` bên dưới là bản dịch hiển thị.
// Trước 2026-07-20 nhóm này dùng câu tiếng Anh nguyên văn ('Unauthorized', 'Access token is required'...)
// làm code — đã chuẩn hoá; test convention ở error-text.registry.spec chặn tái phát.
export const SecurityMessages = {
  accessTokenRequired: 'Error.AccessTokenRequired',
  invalidAccessToken: 'Error.InvalidAccessToken',
  unauthorized: 'Error.Unauthorized',
  mustChangePassword: 'Error.MustChangePassword',
  otpRateLimited: 'Error.OtpRateLimited',
  publicRateLimited: 'Error.PublicRateLimited',
  forbiddenResource: 'Error.ForbiddenResource',
  error: {
    accessTokenRequired: 'Error.AccessTokenRequired',
    invalidAccessToken: 'Error.InvalidAccessToken',
    unauthorized: 'Error.Unauthorized',
    mustChangePassword: 'Error.MustChangePassword',
    otpRateLimited: 'Error.OtpRateLimited',
    publicRateLimited: 'Error.PublicRateLimited',
    forbiddenResource: 'Error.ForbiddenResource'
  },
  errorText: {
    'Error.AccessTokenRequired': 'Vui lòng cung cấp access token',
    'Error.InvalidAccessToken': 'Access token không hợp lệ',
    'Error.Unauthorized': 'Bạn chưa đăng nhập hoặc phiên đăng nhập đã hết hạn',
    'Error.MustChangePassword': 'Bạn cần đổi mật khẩu trước khi tiếp tục',
    'Error.OtpRateLimited': 'Bạn thao tác quá nhanh — vui lòng thử lại sau',
    'Error.PublicRateLimited': 'Bạn thao tác quá nhanh — vui lòng thử lại sau',
    'Error.ForbiddenResource': 'Bạn không có quyền truy cập tài nguyên này'
  }
} as const
