import { Demographic, Genre, PublicationType, SeriesStatus } from '@prisma/client'
import { mapPublicChapter, mapPublicSeriesItem } from './public.mapper'

const seriesRow = {
  id: 'a1b2c3d4e5f6a7b8c9d0e1f2',
  title: 'One Test Piece',
  genres: [Genre.ACTION],
  demographic: Demographic.SHONEN,
  status: SeriesStatus.SERIALIZED,
  publicationType: PublicationType.WEEKLY,
  magazine: 'Weekly Test Jump',
  proposal: { synopsis: 'A synopsis' }
}

describe('public.mapper', () => {
  it('maps every public series field with the provided cover URL and published chapter count', () => {
    const item = mapPublicSeriesItem(seriesRow, 'https://signed.example/x.png', 5)

    expect(item).toEqual({
      id: seriesRow.id,
      title: 'One Test Piece',
      synopsis: 'A synopsis',
      coverImageUrl: 'https://signed.example/x.png',
      genres: [Genre.ACTION],
      demographic: Demographic.SHONEN,
      status: SeriesStatus.SERIALIZED,
      publicationType: PublicationType.WEEKLY,
      magazine: 'Weekly Test Jump',
      publishedChapterCount: 5
    })
  })

  it('maps optional public series fields null-safely', () => {
    const item = mapPublicSeriesItem(
      { ...seriesRow, proposal: null, demographic: null, publicationType: null, magazine: null },
      null,
      0
    )

    expect(item.synopsis).toBeNull()
    expect(item.coverImageUrl).toBeNull()
    expect(item.demographic).toBeNull()
    expect(item.publicationType).toBeNull()
    expect(item.magazine).toBeNull()
    expect(item.publishedChapterCount).toBe(0)
  })

  it('maps a chapter Date to ISO while preserving a null title', () => {
    const publishedAt = new Date('2026-07-16T00:00:00.000Z')

    expect(mapPublicChapter({ id: 'c1', chapterNumber: 3, title: null, publishedAt })).toEqual({
      id: 'c1',
      chapterNumber: 3,
      title: null,
      publishedAt: '2026-07-16T00:00:00.000Z'
    })
  })
})
