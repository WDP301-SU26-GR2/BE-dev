// Centralized user-facing messages for the series module — single source of truth.
// Plain strings only (no NestJS imports). HTTP mapping (status + path) stays in
// `errors/series.errors.ts`, which references the `error` codes below.
export const SeriesMessages = {
  // In-app notification content (notification layer).
  notification: {
    proposalRevision: (reason: string) => `Proposal needs revision: ${reason}`,
    proposalResubmitted: 'Proposal resubmitted',
    proposalApproved: 'Proposal approved',
    proposalRejected: (reason: string) => `Proposal rejected: ${reason}`,
    nameRevision: (reason: string) => `Name needs revision: ${reason}`,
    nameApproved: 'Name approved'
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
    notAssignedEditor: 'Error.NotAssignedEditor'
  }
} as const
