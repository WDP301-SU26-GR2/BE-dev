import { SeriesRequestStatus, SeriesRequestType, SeriesStatus } from '@prisma/client'

// Single source of truth cho chuyển trạng thái SeriesRequest (single-writer SeriesRequestStateService).
export const SERIES_REQUEST_TRANSITIONS: Record<SeriesRequestStatus, SeriesRequestStatus[]> = {
  PENDING: [SeriesRequestStatus.ACCEPTED, SeriesRequestStatus.REJECTED, SeriesRequestStatus.CANCELLED],
  ACCEPTED: [],
  REJECTED: [],
  CANCELLED: []
}

// Trạng thái Series cho phép TẠO từng loại yêu cầu. Kiểm CẢ lúc tạo LẪN lúc accept (chống TOCTOU).
export const ALLOWED_SERIES_STATUS_FOR_REQUEST: Record<SeriesRequestType, SeriesStatus[]> = {
  WITHDRAW: [SeriesStatus.READY_TO_PITCH],
  HIATUS: [SeriesStatus.SERIALIZED],
  COMPLETION: [SeriesStatus.SERIALIZED, SeriesStatus.HIATUS]
}

// Yêu cầu đã đóng — dùng để tìm request đang mở (bất biến 1 PENDING/series).
export const SERIES_REQUEST_CLOSED_STATES: SeriesRequestStatus[] = [
  SeriesRequestStatus.ACCEPTED,
  SeriesRequestStatus.REJECTED,
  SeriesRequestStatus.CANCELLED
]
