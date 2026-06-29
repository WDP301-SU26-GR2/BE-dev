import { TaskStatus } from '@prisma/client'

// Single source of truth cho chuyển trạng thái Task (single-writer TaskStateService).
export const TASK_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  ASSIGNED: [TaskStatus.IN_PROGRESS, TaskStatus.ON_HOLD],
  IN_PROGRESS: [TaskStatus.SUBMITTED, TaskStatus.ON_HOLD],
  SUBMITTED: [TaskStatus.UNDER_REVIEW, TaskStatus.ON_HOLD],
  UNDER_REVIEW: [TaskStatus.APPROVED, TaskStatus.REVISION_REQUESTED, TaskStatus.ON_HOLD],
  REVISION_REQUESTED: [TaskStatus.IN_PROGRESS, TaskStatus.SUBMITTED, TaskStatus.ON_HOLD],
  APPROVED: [],
  ON_HOLD: [TaskStatus.ASSIGNED]
}

// A-TSK-05: chỉ task đang "chờ assistant" mới bị hold khi assistant nghỉ.
// SUBMITTED/UNDER_REVIEW ở "sân" Mangaka → KHÔNG hold.
export const ON_HOLD_SOURCE_STATUSES: TaskStatus[] = [
  TaskStatus.ASSIGNED,
  TaskStatus.IN_PROGRESS,
  TaskStatus.REVISION_REQUESTED
]

// Một task "đã đạt SUBMITTED ≥ 1 lần" (cho cascade COMPOSITE_READY/COMPOSITE_REVIEW).
export const TASK_REACHED_SUBMITTED: TaskStatus[] = [
  TaskStatus.SUBMITTED,
  TaskStatus.UNDER_REVIEW,
  TaskStatus.APPROVED,
  TaskStatus.REVISION_REQUESTED
]
