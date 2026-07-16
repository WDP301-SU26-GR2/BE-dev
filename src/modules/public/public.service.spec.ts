import { PublicChapterNotFoundException, PublicSeriesNotFoundException } from './errors/public.errors'
import { PublicService } from './public.service'

jest.mock('src/core/config/envConfig', () => ({
  __esModule: true,
  default: { PUBLIC_SIGN_TTL_SECONDS: 900 }
}))

const SERIES_ID = 'a1b2c3d4e5f6a7b8c9d0e1f2'
const CHAPTER_ID = 'b1b2c3d4e5f6a7b8c9d0e1f2'

const seriesRow = {
  id: SERIES_ID,
  title: 'One Test Piece',
  coverImage: 'uploads/u/cover.png',
  genres: ['ACTION'],
  demographic: 'SHONEN',
  status: 'SERIALIZED',
  publicationType: 'WEEKLY',
  magazine: 'WTJ',
  proposal: { synopsis: 'syn' },
  createdAt: new Date()
}

describe('PublicService', () => {
  const repo = {
    findPublicSeries: jest.fn(),
    countPublishedChaptersBySeriesIds: jest.fn(),
    findPublicSeriesById: jest.fn(),
    findPublishedChaptersBySeriesId: jest.fn(),
    findPublishedChapterById: jest.fn(),
    findPagesByChapterId: jest.fn(),
    findAdjacentPublishedChapter: jest.fn()
  }
  const storage = { createPresignedDownload: jest.fn() }
  let service: PublicService

  beforeEach(() => {
    jest.clearAllMocks()
    service = new PublicService(repo as never, storage as never)
    storage.createPresignedDownload.mockResolvedValue({ downloadUrl: 'https://signed/x', expiresAt: 'e' })
  })

  describe('listSeries', () => {
    it('maps grouped counts without N+1 and signs only non-null covers with the public TTL', async () => {
      repo.findPublicSeries.mockResolvedValue({
        items: [seriesRow, { ...seriesRow, id: 'f'.repeat(24), coverImage: null }],
        total: 2
      })
      repo.countPublishedChaptersBySeriesIds.mockResolvedValue(new Map([[SERIES_ID, 3]]))

      const result = await service.listSeries({ limit: 20, offset: 0 })

      expect(result.total).toBe(2)
      expect(result.items[0].publishedChapterCount).toBe(3)
      expect(result.items[0].coverImageUrl).toBe('https://signed/x')
      expect(result.items[1].publishedChapterCount).toBe(0)
      expect(result.items[1].coverImageUrl).toBeNull()
      expect(repo.countPublishedChaptersBySeriesIds).toHaveBeenCalledTimes(1)
      expect(repo.countPublishedChaptersBySeriesIds).toHaveBeenCalledWith([SERIES_ID, 'f'.repeat(24)])
      expect(storage.createPresignedDownload).toHaveBeenCalledWith('uploads/u/cover.png', 900)
      expect(storage.createPresignedDownload).toHaveBeenCalledTimes(1)
    })

    it('passes catalog filters and pagination to the repository unchanged', async () => {
      repo.findPublicSeries.mockResolvedValue({ items: [], total: 0 })
      repo.countPublishedChaptersBySeriesIds.mockResolvedValue(new Map())

      await service.listSeries({
        q: 'one',
        genre: 'ACTION',
        demographic: 'SHONEN',
        publicationType: 'WEEKLY',
        limit: 5,
        offset: 10
      } as never)

      expect(repo.findPublicSeries).toHaveBeenCalledWith({
        q: 'one',
        genre: 'ACTION',
        demographic: 'SHONEN',
        publicationType: 'WEEKLY',
        limit: 5,
        offset: 10
      })
    })
  })

  describe('getSeriesDetail', () => {
    it('rejects a malformed id without querying MongoDB', async () => {
      await expect(service.getSeriesDetail('not-an-id')).rejects.toBe(PublicSeriesNotFoundException)
      expect(repo.findPublicSeriesById).not.toHaveBeenCalled()
    })

    it('returns the same 404 for a missing or non-public series', async () => {
      repo.findPublicSeriesById.mockResolvedValue(null)

      await expect(service.getSeriesDetail(SERIES_ID)).rejects.toBe(PublicSeriesNotFoundException)
    })

    it('returns public detail and maps published chapter timestamps to ISO', async () => {
      repo.findPublicSeriesById.mockResolvedValue(seriesRow)
      repo.countPublishedChaptersBySeriesIds.mockResolvedValue(new Map([[SERIES_ID, 1]]))
      repo.findPublishedChaptersBySeriesId.mockResolvedValue([
        {
          id: CHAPTER_ID,
          chapterNumber: 1,
          title: 'Ch1',
          publishedAt: new Date('2026-07-16T00:00:00.000Z')
        }
      ])

      const result = await service.getSeriesDetail(SERIES_ID)

      expect(result.chapters).toEqual([
        { id: CHAPTER_ID, chapterNumber: 1, title: 'Ch1', publishedAt: '2026-07-16T00:00:00.000Z' }
      ])
      expect(result.publishedChapterCount).toBe(1)
    })
  })

  describe('getChapterPages', () => {
    const chapterRow = {
      id: CHAPTER_ID,
      seriesId: SERIES_ID,
      chapterNumber: 2,
      title: 'Ch2',
      publishedAt: new Date('2026-07-16T00:00:00.000Z')
    }

    it('rejects a malformed id without querying MongoDB', async () => {
      await expect(service.getChapterPages('xxx')).rejects.toBe(PublicChapterNotFoundException)
      expect(repo.findPublishedChapterById).not.toHaveBeenCalled()
    })

    it('returns the same 404 for a missing or unpublished chapter', async () => {
      repo.findPublishedChapterById.mockResolvedValue(null)

      await expect(service.getChapterPages(CHAPTER_ID)).rejects.toBe(PublicChapterNotFoundException)
    })

    it('returns the same 404 when the chapter belongs to a non-public series', async () => {
      repo.findPublishedChapterById.mockResolvedValue(chapterRow)
      repo.findPublicSeriesById.mockResolvedValue(null)

      await expect(service.getChapterPages(CHAPTER_ID)).rejects.toBe(PublicChapterNotFoundException)
    })

    it('skips pages without original files before signing and returns published neighbours', async () => {
      repo.findPublishedChapterById.mockResolvedValue(chapterRow)
      repo.findPublicSeriesById.mockResolvedValue(seriesRow)
      repo.findPagesByChapterId.mockResolvedValue([
        { pageNumber: 1, originalFile: 'k1' },
        { pageNumber: 2, originalFile: null },
        { pageNumber: 3, originalFile: 'k3' }
      ])
      repo.findAdjacentPublishedChapter.mockImplementation((_seriesId: string, _number: number, direction: string) =>
        Promise.resolve(direction === 'prev' ? { id: 'prevId' } : null)
      )

      const result = await service.getChapterPages(CHAPTER_ID)

      expect(result.pages.map((page) => page.pageNumber)).toEqual([1, 3])
      expect(result.pages[0].imageUrl).toBe('https://signed/x')
      expect(result.prevChapterId).toBe('prevId')
      expect(result.nextChapterId).toBeNull()
      expect(result.series).toEqual({ id: SERIES_ID, title: 'One Test Piece' })
      expect(storage.createPresignedDownload).toHaveBeenCalledTimes(2)
      expect(storage.createPresignedDownload).toHaveBeenNthCalledWith(1, 'k1', 900)
      expect(storage.createPresignedDownload).toHaveBeenNthCalledWith(2, 'k3', 900)
    })
  })
})
