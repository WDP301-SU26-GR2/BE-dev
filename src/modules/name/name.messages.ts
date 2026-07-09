// Centralized user-facing messages for the name module — single source of truth.
// Plain strings only (no NestJS imports). HTTP mapping (status + path) stays in
// `errors/name.errors.ts`, which references the `error` codes below.
export const NameMessages = {
  response: {},
  // In-app notification content (notification layer).
  notification: {
    nameRevision: (reason: string) => `Name needs revision: ${reason}`,
    nameApproved: 'Name approved',
    nameLoopWarning: (rounds: number) => `Name review loop has reached ${rounds} rounds`
  },
  // Error codes (FE maps these keys to localized text). Consumed by errors/name.errors.ts.
  error: {
    nameNotFound: 'Error.NameNotFound',
    invalidNameState: 'Error.InvalidNameState',
    notSeriesOwner: 'Error.NotSeriesOwner',
    notAssignedEditor: 'Error.NotAssignedEditor',
    seriesNotFound: 'Error.SeriesNotFound',
    seriesNotSerialized: 'Error.SeriesNotSerialized',
    duplicateChapterName: 'Error.DuplicateChapterName',
    seriesAccessDenied: 'Error.SeriesAccessDenied',
    chapterNotFound: 'Error.ChapterNotFound',
    chapterNotDraftForName: 'Error.ChapterNotDraftForName',
    chapterNameAlreadyExists: 'Error.ChapterNameAlreadyExists'
  }
} as const
