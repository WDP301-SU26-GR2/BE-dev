import { SeriesAccessDeniedException } from '../errors/series.errors'
import { requireSeriesParticipant } from './series-participant.guard'

describe('requireSeriesParticipant (PB-06)', () => {
  it('passes when caller is mangaka', () => {
    expect(() => requireSeriesParticipant({ mangakaId: 'm1', editorId: 'e1' }, 'm1')).not.toThrow()
  })
  it('passes when caller is editor', () => {
    expect(() => requireSeriesParticipant({ mangakaId: 'm1', editorId: 'e1' }, 'e1')).not.toThrow()
  })
  it('throws when neither mangaka nor editor', () => {
    expect(() => requireSeriesParticipant({ mangakaId: 'm1', editorId: 'e1' }, 'other')).toThrow(
      SeriesAccessDeniedException
    )
  })
  it('throws when only mangaka is set and caller is not them', () => {
    expect(() => requireSeriesParticipant({ mangakaId: 'm1', editorId: null }, 'e1')).toThrow(
      SeriesAccessDeniedException
    )
  })
  it('throws when only editor is set and caller is not them', () => {
    expect(() => requireSeriesParticipant({ mangakaId: null, editorId: 'e1' }, 'm1')).toThrow(
      SeriesAccessDeniedException
    )
  })
})
