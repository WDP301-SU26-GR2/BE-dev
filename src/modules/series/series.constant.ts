import { SeriesStatus } from '@prisma/client'

// Single source of truth cho chuyển trạng thái Series mà A2 sở hữu.
// State sau PITCHED do B5/Flow5 điều khiển -> để rỗng ở đây (A2 không tự kích hoạt).
export const SERIES_TRANSITIONS: Record<SeriesStatus, SeriesStatus[]> = {
  DRAFT: [SeriesStatus.IN_REVIEW, SeriesStatus.WITHDRAWN],
  IN_REVIEW: [SeriesStatus.READY_TO_PITCH, SeriesStatus.ABANDONED, SeriesStatus.WITHDRAWN],
  READY_TO_PITCH: [SeriesStatus.PITCHED, SeriesStatus.WITHDRAWN],
  PITCHED: [SeriesStatus.SERIALIZED, SeriesStatus.REJECTED], // B5-driven
  SERIALIZED: [],
  HIATUS: [],
  COMPLETING: [],
  CANCELLING: [],
  COMPLETED: [],
  CANCELLED: [],
  REJECTED: [],
  ABANDONED: [],
  WITHDRAWN: []
}
