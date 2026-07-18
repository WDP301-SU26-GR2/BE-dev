// Centralized user-facing messages for the tankobon module — single source of truth.
// Plain strings only (no NestJS imports). HTTP mapping (status + path) stays in
// `errors/tankobon.errors.ts`, which references the `error` codes below.
export const TankobonMessages = {
  response: {
    salesRecorded: 'Đã ghi nhận doanh số tankobon'
  },
  error: {
    seriesNotFound: 'Error.SeriesNotFound',
    dashboardAccessDenied: 'Error.DefenseDashboardAccessDenied'
  },
  errorText: {
    'Error.SeriesNotFound': 'Không tìm thấy series',
    'Error.DefenseDashboardAccessDenied': 'Bạn không có quyền truy cập bảng điều hành bảo vệ series'
  }
} as const
