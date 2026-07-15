import { SeriesStatus } from '@prisma/client'

// Single source of truth cho chuyển trạng thái Series mà A2 sở hữu.
// State sau PITCHED do B5/Flow5 điều khiển -> để rỗng ở đây (A2 không tự kích hoạt).
export const SERIES_TRANSITIONS: Record<SeriesStatus, SeriesStatus[]> = {
  DRAFT: [SeriesStatus.IN_REVIEW, SeriesStatus.WITHDRAWN],
  IN_REVIEW: [SeriesStatus.READY_TO_PITCH, SeriesStatus.ABANDONED, SeriesStatus.WITHDRAWN],
  READY_TO_PITCH: [SeriesStatus.PITCHED, SeriesStatus.WITHDRAWN],
  PITCHED: [SeriesStatus.SERIALIZED, SeriesStatus.REJECTED], // B5-driven
  SERIALIZED: [SeriesStatus.HIATUS, SeriesStatus.COMPLETING, SeriesStatus.CANCELLING],
  HIATUS: [SeriesStatus.SERIALIZED, SeriesStatus.COMPLETING, SeriesStatus.CANCELLING],
  COMPLETING: [SeriesStatus.COMPLETED],
  CANCELLING: [SeriesStatus.CANCELLED],
  COMPLETED: [],
  CANCELLED: [],
  REJECTED: [],
  ABANDONED: [],
  WITHDRAWN: []
}

// Metadata của hồ sơ series đã đóng không còn chỉnh sửa được. Dùng chung ở service guard
// và repository atomic write guard để không có TOCTOU với state transition.
export const SERIES_METADATA_TERMINAL_STATUSES: SeriesStatus[] = [
  SeriesStatus.COMPLETED,
  SeriesStatus.CANCELLED,
  SeriesStatus.ABANDONED,
  SeriesStatus.WITHDRAWN,
  SeriesStatus.REJECTED
]

// Optimistic writes are intentionally bounded so a hot Series cannot keep an API request alive forever.
export const SERIES_PROPOSAL_CAS_MAX_ATTEMPTS = 3
