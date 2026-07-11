// Centralized user-facing messages for the series module — single source of truth.
// Plain strings only (no NestJS imports). HTTP mapping (status + path) stays in
// `errors/series.errors.ts`, which references the `error` codes below.
export const SeriesMessages = {
  response: {
    proposalDeleted: 'Proposal deleted'
  },
  // Internal reasons stored on Series.statusHistory (audit trail). Keep English so logs/audits are
  // scannable; user-facing copy lives in `notification` / `response`.
  reason: {
    forceCancelNoEnding: 'Cancelled without ending — mangaka could not deliver'
  },
  // In-app notification content (notification layer).
  notification: {
    proposalRevision: (reason: string) => `Proposal needs revision: ${reason}`,
    proposalResubmitted: 'Proposal resubmitted',
    proposalApproved: 'Proposal approved',
    proposalRejected: (reason: string) => `Proposal rejected: ${reason}`,
    seriesCancelling: (allowance: number | null) =>
      allowance != null
        ? `Hội đồng đã quyết định huỷ series. Bạn được cấp ${allowance} chương để kết thúc.`
        : 'Hội đồng đã quyết định huỷ series.',
    seriesCompleting: 'Hội đồng đã duyệt kết thúc series.',
    seriesFormatChanged:
      'Hội đồng đã đổi hình thức xuất bản của series. Deadline các chapter đang sản xuất giữ nguyên — hãy đặt deadline cho chapter kế tiếp theo nhịp mới.',
    seriesContinued: 'Hội đồng quyết định giữ series tiếp tục.',
    seriesRejected: 'Hội đồng đã từ chối serial hoá series.',
    seriesHiatusStarted: 'Series đã tạm ngưng (hiatus).',
    seriesResumed: 'Series đã hoạt động trở lại.',
    seriesCancelled: 'Series đã chính thức bị huỷ.',
    seriesCompleted: 'Series đã chính thức hoàn thành.',
    franchiseConsentRequested: 'Có series phái sinh cần bạn đồng ý cho phép thực hiện.',
    franchiseConsentApproved: 'Mangaka gốc đã đồng ý cho series phái sinh.',
    franchiseConsentRejected: 'Mangaka gốc đã từ chối series phái sinh.',
    // PB-06: Mangaka/Editor proposes natural completion (Series stays SERIALIZED/HIATUS, but
    // `completionProposal` set). Counterparty gets a heads-up so they can raise the question to Board.
    completionProposedToEditor: 'Mangaka đề xuất kết thúc series — cần bạn xem xét mở phiên Hội đồng.',
    completionProposedToMangaka: 'Editor đã ghi nhận đề xuất kết thúc series.',
    // PB-06: Series has been HIATUS for > AppConfig.hiatusTooLongDays days — flag for Board triage.
    hiatusTooLong: 'Series đang HIATUS quá lâu — cần Hội đồng bàn hướng xử lý.'
  },
  // Error codes (FE maps these keys to localized text). Consumed by errors/series.errors.ts.
  // Name-related error codes moved to name module (errors/name.errors.ts).
  error: {
    seriesNotFound: 'Error.SeriesNotFound',
    notSeriesOwner: 'Error.NotSeriesOwner',
    proposalNotEditable: 'Error.ProposalNotEditable',
    invalidSeriesTransition: 'Error.InvalidSeriesTransition',
    invalidProposalState: 'Error.InvalidProposalState',
    seriesNotReadyToPitch: 'Error.SeriesNotReadyToPitch',
    parentSeriesNotFound: 'Error.ParentSeriesNotFound',
    seriesAccessDenied: 'Error.SeriesAccessDenied',
    seriesAlreadyClaimed: 'Error.SeriesAlreadyClaimed',
    reviewAlreadyStarted: 'Error.ReviewAlreadyStarted',
    notAssignedEditor: 'Error.NotAssignedEditor',
    proposalNotDeletable: 'Error.ProposalNotDeletable',
    seriesNotInEndingState: 'Error.SeriesNotInEndingState',
    seriesNotProposableForCompletion: 'Error.SeriesNotProposableForCompletion',
    seriesNotInCancellingState: 'Error.SeriesNotInCancellingState',
    franchiseConsentRequired: 'Error.FranchiseConsentRequired',
    notOriginalMangaka: 'Error.NotOriginalMangaka',
    notFranchiseConsentTarget: 'Error.NotFranchiseConsentTarget'
  }
} as const
