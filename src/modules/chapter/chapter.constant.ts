import { ChapterStatus, ManuscriptStatus, PageStatus, PublicationType } from '@prisma/client'

// Single source of truth cho chuyển trạng thái Manuscript (A3 sở hữu).
// A4-INTEGRATION: WIRED → task-cascade.service (page COMPOSITE_READY / manuscript COMPOSITE_REVIEW
// auto khi mọi Task đạt SUBMITTED). Route manual A3 GIỮ làm fallback.
export const MANUSCRIPT_TRANSITIONS: Record<ManuscriptStatus, ManuscriptStatus[]> = {
  DRAFT: [ManuscriptStatus.IN_PRODUCTION],
  IN_PRODUCTION: [ManuscriptStatus.COMPOSITE_REVIEW],
  COMPOSITE_REVIEW: [ManuscriptStatus.EDITOR_REVIEW],
  EDITOR_REVIEW: [ManuscriptStatus.EDITOR_REVISION, ManuscriptStatus.READY_FOR_PRINT],
  EDITOR_REVISION: [ManuscriptStatus.EDITOR_REVIEW],
  READY_FOR_PRINT: [ManuscriptStatus.PUBLISHED, ManuscriptStatus.AWAITING_CO_OWNER_APPROVAL],
  AWAITING_CO_OWNER_APPROVAL: [ManuscriptStatus.PUBLISHED, ManuscriptStatus.EDITOR_REVISION], // co-owner path (defer B3)
  PUBLISHED: []
}

export const PAGE_TRANSITIONS: Record<PageStatus, PageStatus[]> = {
  NOT_STARTED: [PageStatus.IN_PROGRESS],
  IN_PROGRESS: [PageStatus.COMPOSITE_READY],
  COMPOSITE_READY: [PageStatus.COMPLETED, PageStatus.IN_PROGRESS], // cho phép quay lại sửa
  COMPLETED: []
}

// Chapter.status là DẪN XUẤT từ Manuscript (single-writer, BR-PROD-01).
export function deriveChapterStatus(manuscript: ManuscriptStatus): ChapterStatus {
  if (manuscript === ManuscriptStatus.DRAFT) return ChapterStatus.DRAFT
  if (manuscript === ManuscriptStatus.PUBLISHED) return ChapterStatus.PUBLISHED
  return ChapterStatus.IN_PRODUCTION
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
