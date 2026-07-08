export const BoardMessages = {
  response: { voteCast: 'Vote cast successfully' },
  notification: {
    sessionCreated: (title: string) => `Phiên họp Hội đồng "${title}" đã được tạo và đang chờ triển khai.`,
    decisionCreated: 'Một quyết định mới đã được tạo cho phiên họp Hội đồng.'
  },
  error: {
    sessionAlreadyExists: 'Error.BoardSessionAlreadyExists',
    sessionNotFound: 'Error.BoardSessionNotFound',
    boardConfigNotFound: 'Error.BoardConfigNotFound',
    decisionNotFound: 'Error.BoardDecisionNotFound',
    sessionNotOpen: 'Error.BoardSessionNotOpen',
    invalidBoardMembers: 'Error.InvalidBoardMembers',
    invalidQuorum: 'Error.InvalidQuorum',
    voterNotAllowed: 'Error.VoterNotAllowed',
    voterAlreadyVoted: 'Error.VoterAlreadyVoted',
    configLocked: 'Error.BoardConfigLocked',
    sessionClosedReport: 'Error.BoardSessionClosedReport',
    reportNotFound: 'Error.BoardReportNotFound',
    editorNotInvited: 'Error.EditorNotInvited',
    invalidSessionTransition: 'Error.InvalidBoardSessionTransition'
  }
} as const
