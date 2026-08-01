import { ChapterNotFoundException } from '../errors/chapter.errors'
import { ChapterQueryService } from './chapter-query.service'

const chapter = {
  id: 'chapter-1',
  seriesId: 'series-1',
  storyboardId: null,
  chapterNumber: 1,
  title: 'Chapter 1',
  totalPages: 0,
  status: 'DRAFT',
  publishedAt: null,
  hold: null
}

describe('ChapterQueryService', () => {
  const chapterRepository = {
    findChapterWithRelations: jest.fn(),
    findChaptersBySeriesId: jest.fn()
  }
  const progressService = { getProgress: jest.fn(), overviewForMangaka: jest.fn() }
  const service = new ChapterQueryService(chapterRepository as never, progressService as never)

  beforeEach(() => jest.clearAllMocks())

  it('maps a chapter and rejects a missing chapter', async () => {
    chapterRepository.findChapterWithRelations.mockResolvedValueOnce(chapter).mockResolvedValueOnce(null)

    await expect(service.getOne('chapter-1')).resolves.toMatchObject({ id: 'chapter-1', schedule: null })
    await expect(service.getOne('missing')).rejects.toBe(ChapterNotFoundException)
  })

  it('maps a series chapter list', async () => {
    chapterRepository.findChaptersBySeriesId.mockResolvedValue([chapter])
    await expect(service.listBySeries('series-1')).resolves.toMatchObject({ items: [{ id: 'chapter-1' }] })
  })

  it('delegates progress views with their authorization context intact', async () => {
    progressService.getProgress.mockResolvedValue({ percentage: 50 })
    progressService.overviewForMangaka.mockResolvedValue({ active: 1 })
    const user = { userId: 'user-1', roleName: 'MANGAKA' }

    await expect(service.progress(user, 'chapter-1')).resolves.toEqual({ percentage: 50 })
    await expect(service.studioOverview('user-1')).resolves.toEqual({ active: 1 })
    expect(progressService.getProgress).toHaveBeenCalledWith(user, 'chapter-1')
  })
})
