import type { Chapter, Series } from '@prisma/client'

type PublicSeriesRow = Pick<
  Series,
  'id' | 'title' | 'genres' | 'demographic' | 'status' | 'publicationType' | 'magazine'
> & { proposal: { synopsis: string | null } | null }

export const mapPublicSeriesItem = (
  series: PublicSeriesRow,
  coverImageUrl: string | null,
  publishedChapterCount: number
) => ({
  id: series.id,
  title: series.title,
  synopsis: series.proposal?.synopsis ?? null,
  coverImageUrl,
  genres: series.genres,
  demographic: series.demographic ?? null,
  status: series.status,
  publicationType: series.publicationType ?? null,
  magazine: series.magazine ?? null,
  publishedChapterCount
})

type PublicChapterRow = Pick<Chapter, 'id' | 'chapterNumber' | 'title'> & { publishedAt: Date | null }

export const mapPublicChapter = (chapter: PublicChapterRow) => ({
  id: chapter.id,
  chapterNumber: chapter.chapterNumber,
  title: chapter.title ?? null,
  // PUBLISHED chapters have publishedAt; the epoch fallback keeps the mapper total for legacy inconsistent rows.
  publishedAt: (chapter.publishedAt ?? new Date(0)).toISOString()
})
