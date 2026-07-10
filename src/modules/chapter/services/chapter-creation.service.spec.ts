import { SeriesStatus } from '@prisma/client'
import { ChapterCreationService } from './chapter-creation.service'

function makeRepo() {
  return {
    findSeriesById: jest.fn(),
    findChapterByNumber: jest.fn(),
    countChaptersBySeriesId: jest.fn().mockResolvedValue(0),
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

  it('series PITCHED → 409', async () => {
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

describe('ChapterCreationService.create — ending phase (Fix-1 G-1)', () => {
  it('CANCELLING + allowance null → creates ok, KHÔNG count query', async () => {
    const repo = makeRepo()
    repo.findSeriesById.mockResolvedValue({
      id: S,
      mangakaId: 'u',
      status: SeriesStatus.CANCELLING,
      endingChapterAllowance: null,
      chapterCountAtCancelling: 3
    })
    repo.findChapterByNumber.mockResolvedValue(null)
    await make(repo).create('u', { seriesId: S, chapterNumber: 4 })
    expect(repo.countChaptersBySeriesId).not.toHaveBeenCalled()
    expect(repo.createChapter).toHaveBeenCalled()
  })

  it('CANCELLING + snapshot null (legacy) → creates ok, không enforce', async () => {
    const repo = makeRepo()
    repo.findSeriesById.mockResolvedValue({
      id: S,
      mangakaId: 'u',
      status: SeriesStatus.CANCELLING,
      endingChapterAllowance: 2,
      chapterCountAtCancelling: null
    })
    repo.findChapterByNumber.mockResolvedValue(null)
    await expect(make(repo).create('u', { seriesId: S, chapterNumber: 4 } as any)).resolves.toBeDefined()
    expect(repo.countChaptersBySeriesId).not.toHaveBeenCalled()
  })

  it('CANCELLING trong hạn allowance → creates ok', async () => {
    const repo = makeRepo()
    repo.findSeriesById.mockResolvedValue({
      id: S,
      mangakaId: 'u',
      status: SeriesStatus.CANCELLING,
      endingChapterAllowance: 2,
      chapterCountAtCancelling: 3
    })
    repo.countChaptersBySeriesId.mockResolvedValue(4) // 4 - 3 = 1 < 2
    repo.findChapterByNumber.mockResolvedValue(null)
    await expect(make(repo).create('u', { seriesId: S, chapterNumber: 5 } as any)).resolves.toBeDefined()
    expect(repo.createChapter).toHaveBeenCalled()
  })

  it('CANCELLING đạt trần allowance → 409 EndingAllowanceExceeded', async () => {
    const repo = makeRepo()
    repo.findSeriesById.mockResolvedValue({
      id: S,
      mangakaId: 'u',
      status: SeriesStatus.CANCELLING,
      endingChapterAllowance: 2,
      chapterCountAtCancelling: 3
    })
    repo.countChaptersBySeriesId.mockResolvedValue(5) // 5 - 3 = 2 >= 2
    await expect(make(repo).create('u', { seriesId: S, chapterNumber: 6 } as any)).rejects.toMatchObject({
      status: 409
    })
    expect(repo.createChapter).not.toHaveBeenCalled()
  })

  it('COMPLETING → creates ok, KHÔNG đếm (không áp trần)', async () => {
    const repo = makeRepo()
    repo.findSeriesById.mockResolvedValue({
      id: S,
      mangakaId: 'u',
      status: SeriesStatus.COMPLETING
    })
    repo.findChapterByNumber.mockResolvedValue(null)
    await make(repo).create('u', { seriesId: S, chapterNumber: 9 })
    expect(repo.countChaptersBySeriesId).not.toHaveBeenCalled()
    expect(repo.createChapter).toHaveBeenCalled()
  })

  it('HIATUS → 409 SeriesNotSerialized (vẫn chặn)', async () => {
    const repo = makeRepo()
    repo.findSeriesById.mockResolvedValue({ id: S, mangakaId: 'u', status: SeriesStatus.HIATUS })
    await expect(make(repo).create('u', { seriesId: S, chapterNumber: 2 } as any)).rejects.toMatchObject({
      status: 409
    })
    expect(repo.countChaptersBySeriesId).not.toHaveBeenCalled()
  })
})
