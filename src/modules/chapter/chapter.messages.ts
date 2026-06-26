// Centralized user-facing messages for the chapter module.
// Keep all human-readable copy here so it is easy to review/adjust/i18n later.
// (Error codes live in `errors/chapter.errors.ts` as `Error.*` keys — those stay there.)
export const ChapterMessages = {
  // In-app notification content (notification layer).
  notification: {
    awaitingCoOwnerApproval: 'Chapter awaiting co-owner approval',
    chapterPublished: 'Chapter published',
    manuscriptSubmitted: 'Manuscript submitted for review',
    editorRequestedRevision: 'Editor requested revision',
    manuscriptResubmitted: 'Manuscript resubmitted',
    manuscriptApproved: 'Manuscript approved (ready for print)'
  }
} as const
