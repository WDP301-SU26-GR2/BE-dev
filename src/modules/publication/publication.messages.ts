// Centralized user-facing messages for the publication module — single source of truth.
// Plain strings only (no NestJS imports). HTTP mapping (status + path) stays in
// `errors/publication.errors.ts`, which references the `error` codes below.
export const PublicationMessages = {
  response: {
    deleted: 'Publication version deleted'
  },
  // Error codes (FE maps these keys to localized text). Consumed by errors/publication.errors.ts.
  error: {
    notFound: 'Error.PublicationVersionNotFound',
    seriesNotFound: 'Error.SeriesNotFound',
    accessDenied: 'Error.SeriesAccessDenied'
  }
} as const
