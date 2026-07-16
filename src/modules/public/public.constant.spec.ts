import { SeriesStatus } from '@prisma/client'
import { PUBLIC_SERIES_STATUSES } from './public.constant'

describe('PUBLIC_SERIES_STATUSES', () => {
  it('contains exactly the six post-serialization states exposed to public readers', () => {
    expect(PUBLIC_SERIES_STATUSES).toEqual([
      SeriesStatus.SERIALIZED,
      SeriesStatus.HIATUS,
      SeriesStatus.COMPLETING,
      SeriesStatus.CANCELLING,
      SeriesStatus.COMPLETED,
      SeriesStatus.CANCELLED
    ])
  })
})
