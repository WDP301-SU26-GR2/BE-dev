import { SeriesStatus } from '@prisma/client'

// Every post-serialization state remains readable, including completed and cancelled series.
export const PUBLIC_SERIES_STATUSES: SeriesStatus[] = [
  SeriesStatus.SERIALIZED,
  SeriesStatus.HIATUS,
  SeriesStatus.COMPLETING,
  SeriesStatus.CANCELLING,
  SeriesStatus.COMPLETED,
  SeriesStatus.CANCELLED
]

export const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/
