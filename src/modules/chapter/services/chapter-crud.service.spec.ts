import { ChapterCrudService } from './chapter-crud.service'

const CH = '012345678901234567890123'

function makeRepo() {
  return {
    findChapterWithSeries: jest.fn(),
    findChapterByNumber: jest.fn(),
    updateChapter: jest.fn().mockImplementation((_i, d) => Promise.resolve({ id: CH, ...d })),
    updateNameChapterNumber: jest.fn().mockResolvedValue(undefined),
    findChapterWithRelations: jest.fn().mockResolvedValue({ id: CH }),
    deleteChapterCascade: jest.fn().mockResolvedValue(undefined)
  }
}
const make = (repo: any) => new ChapterCrudService(repo)

describe('ChapterCrudService.updateChapter', () => {
  it('malformed id → 404', async () => {
    await expect(make(makeRepo()).updateChapter('u', 'garbage', {} as any)).rejects.toMatchObject({ status: 404 })
  })
  it('not owner → 403', async () => {
    const repo = makeRepo()
    repo.findChapterWithSeries.mockResolvedValue({ id: CH, status: 'DRAFT', series: { mangakaId: 'other' } })
    await expect(make(repo).updateChapter('u', CH, { title: 'x' } as any)).rejects.toMatchObject({ status: 403 })
  })
  it('PUBLISHED → 409 ChapterNotEditable', async () => {
    const repo = makeRepo()
    repo.findChapterWithSeries.mockResolvedValue({ id: CH, status: 'PUBLISHED', series: { mangakaId: 'u' } })
    await expect(make(repo).updateChapter('u', CH, { title: 'x' } as any)).rejects.toMatchObject({ status: 409 })
  })
  it('chapterNumber change when IN_PRODUCTION → 409 ChapterNumberLocked', async () => {
    const repo = makeRepo()
    repo.findChapterWithSeries.mockResolvedValue({
      id: CH,
      seriesId: 's',
      chapterNumber: 5,
      status: 'IN_PRODUCTION',
      nameId: null,
      series: { mangakaId: 'u' }
    })
    await expect(make(repo).updateChapter('u', CH, { chapterNumber: 6 } as any)).rejects.toMatchObject({ status: 409 })
  })
  it('chapterNumber change when DRAFT, dup → 409', async () => {
    const repo = makeRepo()
    repo.findChapterWithSeries.mockResolvedValue({
      id: CH,
      seriesId: 's',
      chapterNumber: 5,
      status: 'DRAFT',
      nameId: null,
      series: { mangakaId: 'u' }
    })
    repo.findChapterByNumber.mockResolvedValue({ id: 'dup' })
    await expect(make(repo).updateChapter('u', CH, { chapterNumber: 6 } as any)).rejects.toMatchObject({ status: 409 })
  })
  it('chapterNumber change DRAFT ok + syncs Name.chapterNumber', async () => {
    const repo = makeRepo()
    repo.findChapterWithSeries.mockResolvedValue({
      id: CH,
      seriesId: 's',
      chapterNumber: 5,
      status: 'DRAFT',
      nameId: 'n1',
      series: { mangakaId: 'u' }
    })
    repo.findChapterByNumber.mockResolvedValue(null)
    await make(repo).updateChapter('u', CH, { chapterNumber: 6 })
    expect(repo.updateChapter).toHaveBeenCalledWith(CH, { chapterNumber: 6 })
    expect(repo.updateNameChapterNumber).toHaveBeenCalledWith('n1', 6)
  })
  it('title-only ok', async () => {
    const repo = makeRepo()
    repo.findChapterWithSeries.mockResolvedValue({
      id: CH,
      seriesId: 's',
      chapterNumber: 5,
      status: 'IN_PRODUCTION',
      nameId: null,
      series: { mangakaId: 'u' }
    })
    await make(repo).updateChapter('u', CH, { title: 'New' })
    expect(repo.updateChapter).toHaveBeenCalledWith(CH, { title: 'New' })
  })
})

describe('ChapterCrudService.deleteChapter', () => {
  it('malformed id → 404', async () => {
    await expect(make(makeRepo()).deleteChapter('u', 'garbage')).rejects.toMatchObject({ status: 404 })
  })
  it('not owner → 403', async () => {
    const repo = makeRepo()
    repo.findChapterWithSeries.mockResolvedValue({ id: CH, status: 'DRAFT', series: { mangakaId: 'other' } })
    await expect(make(repo).deleteChapter('u', CH)).rejects.toMatchObject({ status: 403 })
  })
  it('non-DRAFT → 409 ChapterNotDeletable', async () => {
    const repo = makeRepo()
    repo.findChapterWithSeries.mockResolvedValue({ id: CH, status: 'IN_PRODUCTION', series: { mangakaId: 'u' } })
    await expect(make(repo).deleteChapter('u', CH)).rejects.toMatchObject({ status: 409 })
  })
  it('DRAFT → cascade delete + message', async () => {
    const repo = makeRepo()
    repo.findChapterWithSeries.mockResolvedValue({ id: CH, status: 'DRAFT', series: { mangakaId: 'u' } })
    const out = await make(repo).deleteChapter('u', CH)
    expect(repo.deleteChapterCascade).toHaveBeenCalledWith(CH)
    expect(out.message).toBeTruthy()
  })
})
