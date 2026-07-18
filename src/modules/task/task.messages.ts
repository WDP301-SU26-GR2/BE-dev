// Centralized user-facing message codes for the task module — single source of truth.
// Plain strings only (no NestJS imports). HTTP status + path live in errors/task.errors.ts.
export const TaskMessages = {
  notification: {
    taskAssigned: 'You have been assigned a new task',
    taskSubmittedForReview: (version: number) => `A task was submitted for your review (version ${version})`,
    taskRevisionRequested: (round: number, note: string) => `Revision requested on your task (round ${round}): ${note}`,
    taskApproved: 'Your task was approved',
    taskCancelled: 'Your task was cancelled',
    taskReassigned: 'Your task was reassigned to another assistant'
  },
  reason: {
    regionDeleted: 'Region deleted',
    cancelledByMangaka: 'Cancelled by mangaka',
    reassigned: 'Reassigned to another assistant'
  },
  error: {
    pageNotFound: 'Error.PageNotFound',
    regionNotFound: 'Error.RegionNotFound',
    taskNotFound: 'Error.TaskNotFound',
    notSeriesOwner: 'Error.NotSeriesOwner',
    notTaskAssignee: 'Error.NotTaskAssignee',
    assistantNotHired: 'Error.AssistantNotHired',
    assetNotFound: 'Error.AssetNotFound',
    taskNotReassignable: 'Error.TaskNotReassignable',
    taskNotCancellable: 'Error.TaskNotCancellable',
    regionHasApprovedTasks: 'Error.RegionHasApprovedTasks',
    chapterOnHold: 'Error.ChapterOnHold',
    pageNotEditable: 'Error.PageNotEditable',
    invalidTaskTransition: 'Error.InvalidTaskTransition'
  }
} as const
