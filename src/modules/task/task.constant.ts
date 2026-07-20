import { TaskStatus } from '@prisma/client'

// Single source of truth for Task transitions (single-writer TaskStateService).
export const TASK_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  ASSIGNED: [TaskStatus.IN_PROGRESS, TaskStatus.ON_HOLD, TaskStatus.CANCELLED],
  IN_PROGRESS: [TaskStatus.SUBMITTED, TaskStatus.ON_HOLD, TaskStatus.ASSIGNED, TaskStatus.CANCELLED],
  SUBMITTED: [TaskStatus.UNDER_REVIEW, TaskStatus.ON_HOLD, TaskStatus.CANCELLED],
  UNDER_REVIEW: [TaskStatus.APPROVED, TaskStatus.REVISION_REQUESTED, TaskStatus.ON_HOLD, TaskStatus.CANCELLED],
  REVISION_REQUESTED: [
    TaskStatus.IN_PROGRESS,
    TaskStatus.SUBMITTED,
    TaskStatus.ON_HOLD,
    TaskStatus.ASSIGNED,
    TaskStatus.CANCELLED
  ],
  APPROVED: [],
  ON_HOLD: [TaskStatus.ASSIGNED, TaskStatus.CANCELLED],
  CANCELLED: []
}

// A-TSK-05: only work waiting on the assistant is held when the assistant becomes unavailable.
// SUBMITTED/UNDER_REVIEW is already with the Mangaka and remains reviewable.
export const ON_HOLD_SOURCE_STATUSES: TaskStatus[] = [
  TaskStatus.ASSIGNED,
  TaskStatus.IN_PROGRESS,
  TaskStatus.REVISION_REQUESTED
]

export const CANCELABLE_TASK_STATUSES: TaskStatus[] = [
  TaskStatus.ASSIGNED,
  TaskStatus.IN_PROGRESS,
  TaskStatus.SUBMITTED,
  TaskStatus.UNDER_REVIEW,
  TaskStatus.REVISION_REQUESTED,
  TaskStatus.ON_HOLD
]

export const REASSIGNABLE_TASK_STATUSES: TaskStatus[] = [
  TaskStatus.ASSIGNED,
  TaskStatus.IN_PROGRESS,
  TaskStatus.REVISION_REQUESTED,
  TaskStatus.ON_HOLD
]

// Trạng thái có thể duyệt khi bấm "duyệt cả nhóm" (mirror gate của approve từng task).
export const GROUP_APPROVABLE_TASK_STATUSES: TaskStatus[] = [TaskStatus.SUBMITTED, TaskStatus.UNDER_REVIEW]
