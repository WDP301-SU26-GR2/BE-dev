// Centralized user-facing messages for the series module.
// Keep all human-readable copy here so it is easy to review/adjust/i18n later.
// (Error codes live in `errors/series.errors.ts` as `Error.*` keys — those stay there.)
export const SeriesMessages = {
  // In-app notification content (notification layer).
  notification: {
    proposalRevision: (reason: string) => `Proposal needs revision: ${reason}`,
    proposalResubmitted: 'Proposal resubmitted',
    proposalApproved: 'Proposal approved',
    proposalRejected: (reason: string) => `Proposal rejected: ${reason}`,
    nameRevision: (reason: string) => `Name needs revision: ${reason}`,
    nameApproved: 'Name approved'
  }
} as const
