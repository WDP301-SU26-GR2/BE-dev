import {
  ChapterStatus,
  ContractStatus,
  ManuscriptStatus,
  PageStatus,
  PublicationType,
  SeriesStatus,
  TaskStatus
} from '@prisma/client'

// BR-CONTRACT-05 — giai đoạn kết thúc (Flow 5). Ở 2 trạng thái này hợp đồng có thể đã RỜI `FULLY_EXECUTED`
// một cách hợp lệ: CANCELLING thì payment engine gọi `terminateContractsBySeries` ngay lúc huỷ, COMPLETING thì
// phụ lục chốt các mốc còn lại. Mangaka vẫn phải vẽ nốt chương kết thúc nên không thể đòi FULLY_EXECUTED.
// ⚠ Trước đây code BỎ QUA hẳn việc kiểm hợp đồng ở 2 trạng thái này ⇒ bộ truyện CHƯA TỪNG ký vẫn xuất bản
// được không giới hạn (COMPLETING lại không có trần số chương). Nay chỉ NỚI sang nhánh "đã từng hiệu lực".
export const ENDING_SERIES_STATUSES: SeriesStatus[] = [SeriesStatus.CANCELLING, SeriesStatus.COMPLETING]

// Hợp đồng đã đi qua mốc ký đủ (khác với DRAFT/BOARD_REVIEW/AWAITING_MANGAKA/ACTIVATION_PENDING/VOIDED/
// REJECTED_BY_MANGAKA — những trạng thái CHƯA từng có hiệu lực thi hành).
export const POST_EXECUTION_CONTRACT_STATUSES: ContractStatus[] = [
  ContractStatus.FULLY_EXECUTED,
  ContractStatus.FULFILLED,
  ContractStatus.TERMINATED,
  ContractStatus.TERMINATED_BY_BREACH,
  ContractStatus.EXPIRED
]

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
