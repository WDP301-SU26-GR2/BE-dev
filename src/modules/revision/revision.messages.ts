// Centralized user-facing messages for the revision module — single source of truth.
// Plain strings only (no NestJS imports). HTTP mapping (status + path) stays in
// `errors/revision.errors.ts`, which references the error codes below.
export const RevisionMessages = {
  notification: {
    revisionResolved: (round: number) => `Yêu cầu chỉnh sửa vòng ${round} đã được hoàn tất`
  },
  error: {
    revisionRequestNotFound: 'Error.RevisionRequestNotFound',
    notRevisionRecipient: 'Error.NotRevisionRecipient'
  },
  errorText: {
    'Error.RevisionRequestNotFound': 'Không tìm thấy yêu cầu chỉnh sửa',
    'Error.NotRevisionRecipient': 'Bạn không phải người nhận yêu cầu chỉnh sửa này'
  }
} as const
