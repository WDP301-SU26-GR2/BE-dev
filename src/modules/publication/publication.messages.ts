// Centralized user-facing messages for the publication module — single source of truth.
// Plain strings only (no NestJS imports). HTTP mapping (status + path) stays in
// `errors/publication.errors.ts`, which references the `error` codes below.
export const PublicationMessages = {
  response: {
    deleted: 'Đã xóa phiên bản xuất bản'
  },
  // Error codes (FE maps these keys to localized text). Consumed by errors/publication.errors.ts.
  error: {
    notFound: 'Error.PublicationVersionNotFound',
    seriesNotFound: 'Error.SeriesNotFound',
    accessDenied: 'Error.SeriesAccessDenied'
  },
  errorText: {
    'Error.PublicationVersionNotFound': 'Không tìm thấy phiên bản xuất bản',
    'Error.SeriesNotFound': 'Không tìm thấy series',
    'Error.SeriesAccessDenied': 'Bạn không có quyền truy cập series này',
    'Error.InvalidVersionType': 'Loại phiên bản xuất bản không hợp lệ'
  }
} as const
