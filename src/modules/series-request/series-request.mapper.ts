import { SeriesRequest } from '@prisma/client'
import { z } from 'zod'
import { SeriesRequestResSchema } from './schemas/series-request-schemas'

const iso = (value: Date | null | undefined): string | null => (value ? value.toISOString() : null)

export const toSeriesRequestRes = (row: SeriesRequest): z.infer<typeof SeriesRequestResSchema> => ({
  id: row.id,
  seriesId: row.seriesId,
  requestedBy: row.requestedBy,
  requestType: row.requestType,
  reason: row.reason,
  expectedReturnDate: iso(row.expectedReturnDate),
  proposedEndingChapters: row.proposedEndingChapters ?? null,
  status: row.status,
  decidedBy: row.decidedBy ?? null,
  decidedAt: iso(row.decidedAt),
  decisionNote: row.decisionNote ?? null,
  rejectReason: row.rejectReason ?? null,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString()
})
