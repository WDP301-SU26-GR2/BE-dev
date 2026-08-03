import { SeriesRequestStatus, SeriesRequestType, SeriesStatus } from '@prisma/client'
import { ALLOWED_SERIES_STATUS_FOR_REQUEST, SERIES_REQUEST_TRANSITIONS } from './series-request.constant'

describe('series-request constants', () => {
  it('chỉ cho PENDING đi tiếp; ba trạng thái kết là terminal', () => {
    expect(SERIES_REQUEST_TRANSITIONS[SeriesRequestStatus.PENDING]).toEqual(
      expect.arrayContaining([
        SeriesRequestStatus.ACCEPTED,
        SeriesRequestStatus.REJECTED,
        SeriesRequestStatus.CANCELLED
      ])
    )
    expect(SERIES_REQUEST_TRANSITIONS[SeriesRequestStatus.ACCEPTED]).toEqual([])
    expect(SERIES_REQUEST_TRANSITIONS[SeriesRequestStatus.REJECTED]).toEqual([])
    expect(SERIES_REQUEST_TRANSITIONS[SeriesRequestStatus.CANCELLED]).toEqual([])
  })

  it('WITHDRAW chỉ hợp lệ ở READY_TO_PITCH', () => {
    expect(ALLOWED_SERIES_STATUS_FOR_REQUEST[SeriesRequestType.WITHDRAW]).toEqual([SeriesStatus.READY_TO_PITCH])
  })

  it('HIATUS chỉ hợp lệ ở SERIALIZED', () => {
    expect(ALLOWED_SERIES_STATUS_FOR_REQUEST[SeriesRequestType.HIATUS]).toEqual([SeriesStatus.SERIALIZED])
  })

  it('COMPLETION hợp lệ ở SERIALIZED và HIATUS', () => {
    expect(ALLOWED_SERIES_STATUS_FOR_REQUEST[SeriesRequestType.COMPLETION]).toEqual(
      expect.arrayContaining([SeriesStatus.SERIALIZED, SeriesStatus.HIATUS])
    )
  })
})
