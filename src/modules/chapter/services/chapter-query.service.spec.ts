import { ChapterAccessDeniedException, ChapterNotFoundException } from '../errors/chapter.errors'
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

const USER = { userId: 'user-1', roleName: 'EDITOR' }

describe('ChapterQueryService', () => {
  const chapterRepository = {
    findChapterWithRelations: jest.fn(),
    findChaptersBySeriesId: jest.fn()
  }
  const progressService = { getProgress: jest.fn(), overviewForMangaka: jest.fn() }
  const pageAccess = { assertReadAccess: jest.fn(), assertSeriesReadAccess: jest.fn() }
  const service = new ChapterQueryService(chapterRepository as never, progressService as never, pageAccess as never)

  beforeEach(() => jest.clearAllMocks())

  it('enforces read access before returning a chapter and rejects a missing chapter', async () => {
    chapterRepository.findChapterWithRelations.mockResolvedValueOnce(chapter).mockResolvedValueOnce(null)

    await expect(service.getOne(USER, 'chapter-1')).resolves.toMatchObject({ id: 'chapter-1', schedule: null })
    expect(pageAccess.assertReadAccess).toHaveBeenCalledWith('user-1', 'EDITOR', 'chapter-1')
    await expect(service.getOne(USER, 'missing')).rejects.toBe(ChapterNotFoundException)
  })

  it('propagates an access denial without loading the chapter', async () => {
    pageAccess.assertReadAccess.mockRejectedValueOnce(ChapterAccessDeniedException)

    await expect(service.getOne(USER, 'chapter-1')).rejects.toBe(ChapterAccessDeniedException)
    expect(chapterRepository.findChapterWithRelations).not.toHaveBeenCalled()
  })

  it('enforces series-level read access before mapping a series chapter list', async () => {
    chapterRepository.findChaptersBySeriesId.mockResolvedValue([chapter])

    await expect(service.listBySeries(USER, 'series-1')).resolves.toMatchObject({ items: [{ id: 'chapter-1' }] })
    expect(pageAccess.assertSeriesReadAccess).toHaveBeenCalledWith('user-1', 'EDITOR', 'series-1')
  })

  it('propagates a series access denial without listing chapters', async () => {
    pageAccess.assertSeriesReadAccess.mockRejectedValueOnce(ChapterAccessDeniedException)

    await expect(service.listBySeries(USER, 'series-1')).rejects.toBe(ChapterAccessDeniedException)
    expect(chapterRepository.findChaptersBySeriesId).not.toHaveBeenCalled()
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
