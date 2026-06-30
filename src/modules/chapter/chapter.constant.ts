import { ChapterStatus, ManuscriptStatus, PageStatus } from '@prisma/client'

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
