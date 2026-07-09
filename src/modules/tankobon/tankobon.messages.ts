// Centralized user-facing messages for the tankobon module — single source of truth.
// Plain strings only (no NestJS imports). HTTP mapping (status + path) stays in
// `errors/tankobon.errors.ts`, which references the `error` codes below.
export const TankobonMessages = {
  response: {
    salesRecorded: 'Tankobon sales recorded'
  },
  error: {
    seriesNotFound: 'Error.SeriesNotFound',
    dashboardAccessDenied: 'Error.DefenseDashboardAccessDenied'
  }
} as const
