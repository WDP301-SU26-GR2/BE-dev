// Centralized user-facing messages for the chapter module — single source of truth.
// Plain strings only (no NestJS imports). HTTP mapping (status + path) stays in
// `errors/chapter.errors.ts`, which references the `error` codes below.
export const ChapterMessages = {
  // In-app notification content (notification layer).
  notification: {
    awaitingCoOwnerApproval: 'Chapter awaiting co-owner approval',
    chapterPublished: 'Chapter published',
    deadlineWarning: (chapterId: string) => `Chapter ${chapterId} is approaching its deadline`,
    taskDeadlineWarning: (taskId: string) => `Task ${taskId} is approaching its deadline`,
    manuscriptSubmitted: 'Manuscript submitted for review',
    editorRequestedRevision: 'Editor requested revision',
    manuscriptResubmitted: 'Manuscript resubmitted',
    manuscriptApproved: 'Manuscript approved (ready for print)',
    chapterHeld: (reason: string) => `Chapter production is on hold: ${reason}`,
    chapterResumed: 'Chapter production has resumed',
    coOwnerApproved: 'Co-owner approved the chapter — published',
    coOwnerRejected: (reason: string) => `Co-owner requested revision: ${reason}`,
    coOwnerApprovalEscalated: 'Co-owner approval overdue — escalated to the Board'
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
    nameNotChapterKind: 'Error.NameNotChapterKind',
    seriesNotSerialized: 'Error.SeriesNotSerialized',
    contractNotExecuted: 'Error.ContractNotExecuted',
    chapterAccessDenied: 'Error.ChapterAccessDenied',
    chapterNotHoldable: 'Error.ChapterNotHoldable',
    chapterAlreadyOnHold: 'Error.ChapterAlreadyOnHold',
    chapterNotOnHold: 'Error.ChapterNotOnHold',
    chapterOnHold: 'Error.ChapterOnHold',
    notCoOwner: 'Error.NotCoOwner',
    coOwnerApprovalNotPending: 'Error.CoOwnerApprovalNotPending',
    coOwnerApprovalNotFound: 'Error.CoOwnerApprovalNotFound'
  }
} as const
