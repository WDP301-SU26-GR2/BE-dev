// Centralized user-facing messages for the revision module — single source of truth.
// Plain strings only (no NestJS imports). HTTP mapping (status + path) stays in
// `errors/revision.errors.ts`, which references the error codes below.
export const RevisionMessages = {
  notification: {
    revisionResolved: (round: number) => `Revision round ${round} was marked as done`
  },
  error: {
    revisionRequestNotFound: 'Error.RevisionRequestNotFound',
    notRevisionRecipient: 'Error.NotRevisionRecipient'
  }
} as const
