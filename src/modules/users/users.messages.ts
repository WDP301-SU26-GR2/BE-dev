// Centralized user-facing messages for the users module — single source of truth.
// Plain strings only (no NestJS imports). HTTP mapping (status + path) stays in
// `errors/users.errors.ts`, which references the `error` codes below.
export const UsersMessages = {
  response: {
    userStatusUpdated: 'Cập nhật trạng thái người dùng thành công',
    userDeleted: 'Xoá người dùng thành công',
    userRestored: 'Khôi phục người dùng thành công'
  },
  notification: {
    banned: (reason?: string) => `Tài khoản của bạn đã bị cấm${reason ? `: ${reason}` : ''}`,
    blocked: (reason?: string) => `Tài khoản của bạn đã bị khoá${reason ? `: ${reason}` : ''}`,
    reactivated: 'Tài khoản của bạn đã được kích hoạt lại'
  },
  // Error codes (FE maps these keys to localized text). Consumed by errors/users.errors.ts.
  error: {
    emailAlreadyExists: 'Error.EmailAlreadyExists',
    profileNotFound: 'Error.ProfileNotFound',
    userNotFound: 'Error.UserNotFound',
    cannotModifyAdminUser: 'Error.CannotModifyAdminUser',
    userAlreadyDeleted: 'Error.UserAlreadyDeleted',
    userNotDeleted: 'Error.UserNotDeleted'
  },
  errorText: {
    'Error.EmailAlreadyExists': 'Email này đã được đăng ký',
    'Error.ProfileNotFound': 'Không tìm thấy hồ sơ người dùng',
    'Error.UserNotFound': 'Không tìm thấy người dùng',
    'Error.CannotModifyAdminUser': 'Không thể thay đổi tài khoản quản trị viên',
    'Error.UserAlreadyDeleted': 'Người dùng này đã bị xoá',
    'Error.UserNotDeleted': 'Người dùng này chưa bị xoá'
  }
} as const
