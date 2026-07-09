import { SeriesStatus } from '@prisma/client'
import { ChapterCreationService } from './chapter-creation.service'

function makeRepo() {
  return {
    findSeriesById: jest.fn(),
    findChapterByNumber: jest.fn(),
    createChapter: jest
      .fn()
      .mockImplementation((d: any) => Promise.resolve({ id: 'ch1', status: 'DRAFT', nameId: null, ...d }))
  }
}
const make = (repo: any) => new ChapterCreationService(repo)
const S = '012345678901234567890123'

describe('ChapterCreationService.create (chapter-first)', () => {
  it('malformed seriesId → 404', async () => {
    const repo = makeRepo()
    await expect(make(repo).create('u', { seriesId: 'garbage', chapterNumber: 1 } as any)).rejects.toMatchObject({
      status: 404
    })
    expect(repo.findSeriesById).not.toHaveBeenCalled()
  })

  it('not owner → 403', async () => {
    const repo = makeRepo()
    repo.findSeriesById.mockResolvedValue({ id: S, mangakaId: 'other', status: SeriesStatus.SERIALIZED })
    await expect(make(repo).create('u', { seriesId: S, chapterNumber: 1 } as any)).rejects.toMatchObject({
      status: 403
    })
  })

  it('series not SERIALIZED → 409', async () => {
    const repo = makeRepo()
    repo.findSeriesById.mockResolvedValue({ id: S, mangakaId: 'u', status: SeriesStatus.PITCHED })
    await expect(make(repo).create('u', { seriesId: S, chapterNumber: 1 } as any)).rejects.toMatchObject({
      status: 409
    })
  })

  it('duplicate chapterNumber → 409', async () => {
    const repo = makeRepo()
    repo.findSeriesById.mockResolvedValue({ id: S, mangakaId: 'u', status: SeriesStatus.SERIALIZED })
    repo.findChapterByNumber.mockResolvedValue({ id: 'dup' })
    await expect(make(repo).create('u', { seriesId: S, chapterNumber: 5 } as any)).rejects.toMatchObject({
      status: 409
    })
  })

  it('valid → creates DRAFT chapter (nameId null)', async () => {
    const repo = makeRepo()
    repo.findSeriesById.mockResolvedValue({ id: S, mangakaId: 'u', status: SeriesStatus.SERIALIZED })
    repo.findChapterByNumber.mockResolvedValue(null)
    const out = await make(repo).create('u', { seriesId: S, chapterNumber: 5, title: 'X' })
    expect(repo.createChapter).toHaveBeenCalledWith({ seriesId: S, chapterNumber: 5, title: 'X' })
    expect(out.status).toBe('DRAFT')
  })
})
