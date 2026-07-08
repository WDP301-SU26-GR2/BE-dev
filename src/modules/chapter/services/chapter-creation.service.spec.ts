import { NameKind, NameStatus, SeriesStatus } from '@prisma/client'
import { ChapterCreationService } from './chapter-creation.service'
import { NameNotChapterKindException } from '../errors/chapter.errors'

const body = { seriesId: 's1', nameId: 'n1', title: 'Ch1' }

function makeRepo(over: Record<string, unknown> = {}) {
  return {
    findSeriesById: jest.fn().mockResolvedValue({ id: 's1', mangakaId: 'u1', status: SeriesStatus.SERIALIZED }),
    findNameById: jest.fn().mockResolvedValue({
      id: 'n1',
      seriesId: 's1',
      kind: NameKind.CHAPTER,
      chapterNumber: 1,
      status: NameStatus.APPROVED
    }),
    findChapterByNumber: jest.fn().mockResolvedValue(null),
    createChapter: jest.fn().mockResolvedValue({ id: 'c1', seriesId: 's1', chapterNumber: 1 }),
    ...over
  }
}

describe('ChapterCreationService.create', () => {
  it('creates chapter from approved name', async () => {
    const repo = makeRepo()
    const svc = new ChapterCreationService(repo as never)
    const res = await svc.create('u1', body)
    expect(repo.createChapter).toHaveBeenCalledWith({ seriesId: 's1', nameId: 'n1', chapterNumber: 1, title: 'Ch1' })
    expect(res).toMatchObject({ id: 'c1' })
  })

  it('rejects when series is not SERIALIZED (409)', async () => {
    const repo = makeRepo({
      findSeriesById: jest.fn().mockResolvedValue({ id: 's1', mangakaId: 'u1', status: SeriesStatus.PITCHED })
    })
    const svc = new ChapterCreationService(repo as never)
    await expect(svc.create('u1', body)).rejects.toBeDefined()
    expect(repo.createChapter).not.toHaveBeenCalled()
  })

  it('rejects when caller is not the series owner (403)', async () => {
    const repo = makeRepo({ findSeriesById: jest.fn().mockResolvedValue({ id: 's1', mangakaId: 'someone' }) })
    const svc = new ChapterCreationService(repo as never)
    await expect(svc.create('u1', body)).rejects.toBeDefined()
  })

  it('rejects when name not approved (422)', async () => {
    const repo = makeRepo({
      findNameById: jest.fn().mockResolvedValue({
        id: 'n1',
        seriesId: 's1',
        kind: NameKind.CHAPTER,
        chapterNumber: 1,
        status: NameStatus.IN_REVIEW
      })
    })
    const svc = new ChapterCreationService(repo as never)
    await expect(svc.create('u1', body)).rejects.toBeDefined()
  })

  it('rejects when name not in series (422)', async () => {
    const repo = makeRepo({
      findNameById: jest.fn().mockResolvedValue({
        id: 'n1',
        seriesId: 'other',
        kind: NameKind.CHAPTER,
        chapterNumber: 1,
        status: NameStatus.APPROVED
      })
    })
    const svc = new ChapterCreationService(repo as never)
    await expect(svc.create('u1', body)).rejects.toBeDefined()
  })

  it('rejects duplicate chapter number (409)', async () => {
    const repo = makeRepo({ findChapterByNumber: jest.fn().mockResolvedValue({ id: 'cX' }) })
    const svc = new ChapterCreationService(repo as never)
    await expect(svc.create('u1', body)).rejects.toBeDefined()
  })

  it('rejects proposal-kind Name (422)', async () => {
    const repo = makeRepo({
      findNameById: jest.fn().mockResolvedValue({
        id: 'n1',
        seriesId: 's1',
        kind: NameKind.PROPOSAL,
        chapterNumber: null,
        status: NameStatus.APPROVED
      })
    })
    const svc = new ChapterCreationService(repo as never)
    await expect(svc.create('u1', body)).rejects.toBe(NameNotChapterKindException)
    expect(repo.createChapter).not.toHaveBeenCalled()
  })

  it('derives chapterNumber from Name', async () => {
    const repo = makeRepo({
      findNameById: jest.fn().mockResolvedValue({
        id: 'n1',
        seriesId: 's1',
        kind: NameKind.CHAPTER,
        chapterNumber: 5,
        status: NameStatus.APPROVED
      })
    })
    const svc = new ChapterCreationService(repo as never)
    await svc.create('u1', body)
    expect(repo.createChapter).toHaveBeenCalledWith(expect.objectContaining({ chapterNumber: 5 }))
  })
})
