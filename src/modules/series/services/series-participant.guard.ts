import { SeriesAccessDeniedException } from '../errors/series.errors'

/**
 * PB-06: Mangaka/Editor must both be assigned to the series to propose completion.
 * `mangakaId` / `editorId` may be null on either side; equality on a non-null field
 * (with strict `!==`) is the simplest correct check — both must match the caller.
 */
export function requireSeriesParticipant(
  series: { mangakaId?: string | null; editorId?: string | null },
  callerId: string
): void {
  if (series.mangakaId !== callerId && series.editorId !== callerId) throw SeriesAccessDeniedException
}
