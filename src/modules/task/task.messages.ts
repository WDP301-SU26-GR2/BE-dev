// Centralized user-facing message codes for the task module — single source of truth.
// Plain strings only (no NestJS imports). HTTP status + path live in errors/task.errors.ts.
export const TaskMessages = {
  notification: {
    taskAssigned: 'You have been assigned a new task',
    taskSubmittedForReview: 'A task was submitted for your review',
    taskRevisionRequested: 'Revision requested on your task',
    taskApproved: 'Your task was approved'
  },
  error: {
    pageNotFound: 'Error.PageNotFound',
    regionNotFound: 'Error.RegionNotFound',
    regionHasTasks: 'Error.RegionHasTasks',
    taskNotFound: 'Error.TaskNotFound',
    notSeriesOwner: 'Error.NotSeriesOwner',
    notTaskAssignee: 'Error.NotTaskAssignee',
    assistantNotHired: 'Error.AssistantNotHired',
    assetNotFound: 'Error.AssetNotFound',
    taskNotReassignable: 'Error.TaskNotReassignable',
    invalidTaskTransition: 'Error.InvalidTaskTransition'
  }
} as const
