import { ChapterStatus, ManuscriptStatus, PageStatus, PublicationType, TaskStatus } from '@prisma/client'

export const MANUSCRIPT_TRANSITIONS: Record<ManuscriptStatus, ManuscriptStatus[]> = {
  DRAFT: [ManuscriptStatus.IN_PRODUCTION],
  IN_PRODUCTION: [ManuscriptStatus.EDITOR_REVIEW],
  EDITOR_REVIEW: [ManuscriptStatus.EDITOR_REVISION, ManuscriptStatus.READY_FOR_PRINT],
  EDITOR_REVISION: [ManuscriptStatus.EDITOR_REVIEW],
  READY_FOR_PRINT: [ManuscriptStatus.PUBLISHED, ManuscriptStatus.AWAITING_CO_OWNER_APPROVAL],
  AWAITING_CO_OWNER_APPROVAL: [ManuscriptStatus.PUBLISHED, ManuscriptStatus.EDITOR_REVISION],
  PUBLISHED: []
}

export const PAGE_TRANSITIONS: Record<PageStatus, PageStatus[]> = {
  DRAFT: [PageStatus.COMPLETED],
  COMPLETED: [PageStatus.REVISING],
  REVISING: [PageStatus.COMPLETED]
}

export const PAGE_EDITABLE_STATUSES: PageStatus[] = [PageStatus.DRAFT, PageStatus.REVISING]

export const BLOCKING_TASK_STATUSES: TaskStatus[] = [
  TaskStatus.ASSIGNED,
  TaskStatus.IN_PROGRESS,
  TaskStatus.SUBMITTED,
  TaskStatus.UNDER_REVIEW,
  TaskStatus.REVISION_REQUESTED,
  TaskStatus.ON_HOLD
]

// Explicit membership is intentional: enum declaration order is not a lifecycle contract.
export const PROGRESS_DONE_STATUSES: ManuscriptStatus[] = [
  ManuscriptStatus.EDITOR_REVIEW,
  ManuscriptStatus.READY_FOR_PRINT,
  ManuscriptStatus.AWAITING_CO_OWNER_APPROVAL,
  ManuscriptStatus.PUBLISHED
]

// Chapter.status is derived from Manuscript.status (single writer, BR-PROD-01).
export function deriveChapterStatus(manuscript: ManuscriptStatus): ChapterStatus {
  if (manuscript === ManuscriptStatus.DRAFT) return ChapterStatus.DRAFT
  if (manuscript === ManuscriptStatus.PUBLISHED) return ChapterStatus.PUBLISHED
  return ChapterStatus.IN_PRODUCTION
}

// Task B: sau khi xoá page, dồn số các page còn lại về 1..N liên tục theo thứ tự pageNumber hiện tại.
// Trả về CHỈ các page cần đổi số (id + số mới) để giảm số lệnh update trong transaction.
// Pure function → unit-test được; repo áp dụng trong 1 transaction (atomic với lệnh xoá).
export function computePageRenumber(
  pages: Array<{ id: string; pageNumber: number }>
): Array<{ id: string; pageNumber: number }> {
  const sorted = [...pages].sort((a, b) => a.pageNumber - b.pageNumber)
  const updates: Array<{ id: string; pageNumber: number }> = []
  sorted.forEach((page, index) => {
    const desired = index + 1
    if (page.pageNumber !== desired) updates.push({ id: page.id, pageNumber: desired })
  })
  return updates
}

export const WARNING_LEVEL = {
  NONE: 'NONE',
  YELLOW: 'YELLOW',
  RED: 'RED',
  CRITICAL: 'CRITICAL'
} as const

export type WarningLevel = (typeof WARNING_LEVEL)[keyof typeof WARNING_LEVEL]

export function computeWarningLevel(
  publicationType: PublicationType | null,
  deadline: Date | null,
  progressPct: number,
  now: Date = new Date()
): WarningLevel {
  if (!deadline) return WARNING_LEVEL.NONE
  const remainingHours = (deadline.getTime() - now.getTime()) / 3_600_000
  if (remainingHours < 0) return WARNING_LEVEL.CRITICAL
  if (publicationType === PublicationType.WEEKLY) {
    if (remainingHours <= 24 && progressPct < 0.9) return WARNING_LEVEL.RED
    if (remainingHours <= 48 && progressPct < 0.7) return WARNING_LEVEL.YELLOW
    return WARNING_LEVEL.NONE
  }
  if (remainingHours <= 48 && progressPct < 0.85) return WARNING_LEVEL.RED
  if (remainingHours <= 120 && progressPct < 0.6) return WARNING_LEVEL.YELLOW
  return WARNING_LEVEL.NONE
}
