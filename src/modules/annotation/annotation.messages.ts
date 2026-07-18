// Centralized user-facing messages for the annotation module — single source of truth.
// Plain strings only (no NestJS imports). HTTP mapping (status + path) stays in
// `errors/annotation.errors.ts`, which references the `error` codes below.
export const AnnotationMessages = {
  // Error codes (FE maps these keys to localized text). Consumed by errors/annotation.errors.ts.
  error: {
    annotationNotFound: 'Error.AnnotationNotFound',
    annotationForbidden: 'Error.AnnotationForbidden',
    targetNotFound: 'Error.AnnotationTargetNotFound'
  },
  errorText: {
    'Error.AnnotationNotFound': 'Không tìm thấy ghi chú',
    'Error.AnnotationForbidden': 'Bạn không có quyền thao tác với ghi chú này',
    'Error.AnnotationTargetNotFound': 'Không tìm thấy đối tượng được ghi chú'
  }
} as const
