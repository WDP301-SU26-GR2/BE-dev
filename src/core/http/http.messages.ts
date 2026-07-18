// Centralized generic messages produced at the HTTP layer (error envelope / safety net).
// Module-specific messages live in `src/modules/<name>/<name>.messages.ts`.
export const HttpMessages = {
  response: { success: 'Thành công' },
  error: {
    validationFailed: 'Error.ValidationFailed',
    recordAlreadyExists: 'Error.RecordAlreadyExists',
    internalServerError: 'Error.Internal'
  },
  errorText: {
    'Error.ValidationFailed': 'Dữ liệu không hợp lệ',
    'Error.RecordAlreadyExists': 'Dữ liệu đã tồn tại',
    'Error.Internal': 'Lỗi hệ thống, vui lòng thử lại'
  }
} as const
