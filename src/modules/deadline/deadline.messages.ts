export const DeadlineMessages = {
  notification: {
    proposed: 'A deadline change was proposed',
    counterProposed: 'A counter deadline was proposed',
    agreed: 'Deadline proposal was agreed',
    rejected: 'Deadline proposal was rejected and escalated to the board',
    withdrawn: 'Deadline request was withdrawn',
    approved: 'Deadline change approved - schedule updated',
    boardReview: 'Deadline change sent to board review (affects publication slot)',
    boardApproved: 'Board approved the deadline change',
    boardRejected: 'Board rejected the deadline change'
  },
  error: {
    notFound: 'Error.DeadlineRequestNotFound',
    accessDenied: 'Error.DeadlineRequestAccessDenied',
    notCounterparty: 'Error.NotCounterparty',
    openExists: 'Error.OpenDeadlineRequestExists',
    notAllowed: 'Error.DeadlineRequestNotAllowed',
    invalidTransition: 'Error.InvalidDeadlineRequestTransition',
    deadlineNotAwaitingBoard: 'Error.DeadlineNotAwaitingBoard'
  }
} as const
