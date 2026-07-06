import { SeriesStatus } from '@prisma/client'
import { SERIES_TRANSITIONS } from './series.constant'

describe('SERIES_TRANSITIONS post-serialize', () => {
  it('SERIALIZED can go to HIATUS, COMPLETING, CANCELLING', () => {
    expect(SERIES_TRANSITIONS[SeriesStatus.SERIALIZED]).toEqual(
      expect.arrayContaining([SeriesStatus.HIATUS, SeriesStatus.COMPLETING, SeriesStatus.CANCELLING])
    )
  })
  it('HIATUS can resume to SERIALIZED or go to COMPLETING/CANCELLING', () => {
    expect(SERIES_TRANSITIONS[SeriesStatus.HIATUS]).toEqual(
      expect.arrayContaining([SeriesStatus.SERIALIZED, SeriesStatus.COMPLETING, SeriesStatus.CANCELLING])
    )
  })
  it('COMPLETING → COMPLETED only; CANCELLING → CANCELLED only', () => {
    expect(SERIES_TRANSITIONS[SeriesStatus.COMPLETING]).toEqual([SeriesStatus.COMPLETED])
    expect(SERIES_TRANSITIONS[SeriesStatus.CANCELLING]).toEqual([SeriesStatus.CANCELLED])
  })
  it('terminal states stay empty', () => {
    expect(SERIES_TRANSITIONS[SeriesStatus.COMPLETED]).toEqual([])
    expect(SERIES_TRANSITIONS[SeriesStatus.CANCELLED]).toEqual([])
  })
})
