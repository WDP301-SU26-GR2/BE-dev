// Centralized user-facing messages for the series module — single source of truth.
// Plain strings only (no NestJS imports). HTTP mapping (status + path) stays in
// `errors/series.errors.ts`, which references the `error` codes below.
export const SeriesMessages = {
  response: {
    proposalDeleted: 'Proposal deleted'
  },
  // In-app notification content (notification layer).
  notification: {
    proposalRevision: (reason: string) => `Proposal needs revision: ${reason}`,
    proposalResubmitted: 'Proposal resubmitted',
    proposalApproved: 'Proposal approved',
    proposalRejected: (reason: string) => `Proposal rejected: ${reason}`,
    nameRevision: (reason: string) => `Name needs revision: ${reason}`,
    nameApproved: 'Name approved',
    nameLoopWarning: (rounds: number) => `Name review loop has reached ${rounds} rounds`,
    seriesCancelling: (allowance: number | null) =>
      allowance != null
        ? `Hội đồng đã quyết định huỷ series. Bạn được cấp ${allowance} chương để kết thúc.`
        : 'Hội đồng đã quyết định huỷ series.',
    seriesCompleting: 'Hội đồng đã duyệt kết thúc series.',
    seriesFormatChanged: 'Hội đồng đã đổi hình thức xuất bản của series.',
    seriesContinued: 'Hội đồng quyết định giữ series tiếp tục.',
    seriesRejected: 'Hội đồng đã từ chối serial hoá series.',
    seriesHiatusStarted: 'Series đã tạm ngưng (hiatus).',
    seriesResumed: 'Series đã hoạt động trở lại.',
    seriesCancelled: 'Series đã chính thức bị huỷ.',
    seriesCompleted: 'Series đã chính thức hoàn thành.',
    franchiseConsentRequested: 'Có series phái sinh cần bạn đồng ý cho phép thực hiện.',
    franchiseConsentApproved: 'Mangaka gốc đã đồng ý cho series phái sinh.',
    franchiseConsentRejected: 'Mangaka gốc đã từ chối series phái sinh.'
  },
  // Error codes (FE maps these keys to localized text). Consumed by errors/series.errors.ts.
  error: {
    seriesNotFound: 'Error.SeriesNotFound',
    notSeriesOwner: 'Error.NotSeriesOwner',
    proposalNotEditable: 'Error.ProposalNotEditable',
    invalidSeriesTransition: 'Error.InvalidSeriesTransition',
    invalidProposalState: 'Error.InvalidProposalState',
    invalidNameState: 'Error.InvalidNameState',
    seriesNotReadyToPitch: 'Error.SeriesNotReadyToPitch',
    parentSeriesNotFound: 'Error.ParentSeriesNotFound',
    seriesAccessDenied: 'Error.SeriesAccessDenied',
    nameNotFound: 'Error.NameNotFound',
    seriesAlreadyClaimed: 'Error.SeriesAlreadyClaimed',
    reviewAlreadyStarted: 'Error.ReviewAlreadyStarted',
    notAssignedEditor: 'Error.NotAssignedEditor',
    proposalNotDeletable: 'Error.ProposalNotDeletable',
    seriesNotInEndingState: 'Error.SeriesNotInEndingState',
    franchiseConsentRequired: 'Error.FranchiseConsentRequired',
    notOriginalMangaka: 'Error.NotOriginalMangaka',
    notFranchiseConsentTarget: 'Error.NotFranchiseConsentTarget'
  }
} as const
