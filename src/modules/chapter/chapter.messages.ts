// Centralized user-facing messages for the chapter module — single source of truth.
// Plain strings only (no NestJS imports). HTTP mapping (status + path) stays in
// `errors/chapter.errors.ts`, which references the `error` codes below.
export const ChapterMessages = {
  // In-app notification content (notification layer).
  notification: {
    awaitingCoOwnerApproval: 'Chapter awaiting co-owner approval',
    chapterPublished: 'Chapter published',
    manuscriptSubmitted: 'Manuscript submitted for review',
    editorRequestedRevision: 'Editor requested revision',
    manuscriptResubmitted: 'Manuscript resubmitted',
    manuscriptApproved: 'Manuscript approved (ready for print)'
  },
  // Error codes (FE maps these keys to localized text). Consumed by errors/chapter.errors.ts.
  error: {
    chapterNotFound: 'Error.ChapterNotFound',
    notSeriesOwner: 'Error.NotSeriesOwner',
    notSeriesEditor: 'Error.NotSeriesEditor',
    invalidManuscriptTransition: 'Error.InvalidManuscriptTransition',
    invalidPageTransition: 'Error.InvalidPageTransition',
    pagesNotAllCompleted: 'Error.PagesNotAllCompleted',
    duplicateChapterNumber: 'Error.DuplicateChapterNumber',
    pageNotFound: 'Error.PageNotFound',
    nameNotApproved: 'Error.NameNotApproved',
    nameNotInSeries: 'Error.NameNotInSeries',
    contractNotExecuted: 'Error.ContractNotExecuted'
  }
} as const
