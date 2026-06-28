// Centralized user-facing messages for the annotation module — single source of truth.
// Plain strings only (no NestJS imports). HTTP mapping (status + path) stays in
// `errors/annotation.errors.ts`, which references the `error` codes below.
export const AnnotationMessages = {
  // Error codes (FE maps these keys to localized text). Consumed by errors/annotation.errors.ts.
  error: {
    annotationNotFound: 'Error.AnnotationNotFound',
    annotationForbidden: 'Error.AnnotationForbidden'
  }
} as const
