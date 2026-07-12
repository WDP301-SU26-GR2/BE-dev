export const BoardMessages = {
  response: { voteCast: 'Vote cast successfully' },
  notification: {
    sessionCreated: (title: string) => `Phiên họp Hội đồng "${title}" đã được tạo và đang chờ triển khai.`,
    decisionCreated: 'Một quyết định mới đã được tạo cho phiên họp Hội đồng.',
    sessionConcluded: 'Phiên họp Hội đồng đã kết thúc.',
    sessionConcludedWithExpired: (count: number) =>
      `Phiên họp Hội đồng đã kết thúc. ${count} quyết định chưa đủ quorum đã hết hiệu lực - hãy mở phiên mới để bỏ phiếu lại.`
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
    invalidSessionTransition: 'Error.InvalidBoardSessionTransition',
    notSessionCreator: 'Error.NotSessionCreator',
    notEnoughBoardMembers: 'Error.NotEnoughBoardMembers',
    rosterSourceRequired: 'Error.RosterSourceRequired',
    seriesNotFound: 'Error.SeriesNotFound'
  }
} as const
