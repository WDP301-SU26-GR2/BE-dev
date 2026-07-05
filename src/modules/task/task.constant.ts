import { TaskStatus } from '@prisma/client'

// Single source of truth cho chuyển trạng thái Task (single-writer TaskStateService).
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

// A-TSK-05: chỉ task đang "chờ assistant" mới bị hold khi assistant nghỉ.
// SUBMITTED/UNDER_REVIEW ở "sân" Mangaka → KHÔNG hold.
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

// Một task "đã đạt SUBMITTED ≥ 1 lần" (cho cascade COMPOSITE_READY/COMPOSITE_REVIEW).
// CANCELLED được lọc khỏi mẫu số ở task-cascade.service (task hủy không chặn cascade).
export const TASK_REACHED_SUBMITTED: TaskStatus[] = [
  TaskStatus.SUBMITTED,
  TaskStatus.UNDER_REVIEW,
  TaskStatus.APPROVED,
  TaskStatus.REVISION_REQUESTED
]
