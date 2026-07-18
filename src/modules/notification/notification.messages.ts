// Centralized user-facing messages for the notification module.
// Plain strings only; HTTP mapping stays in errors/notification.errors.ts.
//
// referenceType taxonomy (A-NOT-03): referenceType = '<ENTITY>_<ACTION>'
// (referenceId = entity id). The idempotency key
// (recipientId + type + referenceId + referenceType) stays unique per real event,
// while still deduping queue retries for the same event.
//
// chapter:  CHAPTER_PUBLISHED, MANUSCRIPT_AWAITING_CO_OWNER, MANUSCRIPT_SUBMITTED,
//           MANUSCRIPT_REVISION_REQUESTED, MANUSCRIPT_RESUBMITTED, MANUSCRIPT_APPROVED
// task:     TASK_ASSIGNED, TASK_SUBMITTED, TASK_REVISION_REQUESTED, TASK_APPROVED
// series:   NAME_REVISION_REQUESTED, NAME_APPROVED, PROPOSAL_REVISION_REQUESTED,
//           PROPOSAL_RESUBMITTED, PROPOSAL_APPROVED, PROPOSAL_REJECTED
// studio:   INVITE_RECEIVED, INVITE_ACCEPTED, INVITE_DECLINED, ASSIGNMENT_TERMINATED
// reviews:  ASSISTANT_REVIEW_RECEIVED, MANGAKA_REVIEW_RECEIVED
// deadline: DEADLINE_PROPOSED, DEADLINE_COUNTERED, DEADLINE_AGREED, DEADLINE_REJECTED,
//           DEADLINE_WITHDRAWN, DEADLINE_APPROVED, DEADLINE_BOARD_REVIEW
// cron:     DEADLINE_WARNING:YYYY-MM-DD
export const NotificationMessages = {
  error: {
    notificationNotFound: 'Error.NotificationNotFound'
  },
  errorText: {
    'Error.NotificationNotFound': 'Không tìm thấy thông báo'
  }
} as const
