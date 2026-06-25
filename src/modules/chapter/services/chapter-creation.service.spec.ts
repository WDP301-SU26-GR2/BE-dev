import { NameStatus } from '@prisma/client'
import { ChapterCreationService } from './chapter-creation.service'

const body = { seriesId: 's1', nameId: 'n1', chapterNumber: 1, title: 'Ch1' }

function makeRepo(over: Record<string, unknown> = {}) {
  return {
    findSeriesById: jest.fn().mockResolvedValue({ id: 's1', mangakaId: 'u1' }),
    findNameById: jest.fn().mockResolvedValue({ id: 'n1', seriesId: 's1', status: NameStatus.APPROVED }),
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

  it('rejects when caller is not the series owner (403)', async () => {
    const repo = makeRepo({ findSeriesById: jest.fn().mockResolvedValue({ id: 's1', mangakaId: 'someone' }) })
    const svc = new ChapterCreationService(repo as never)
    await expect(svc.create('u1', body)).rejects.toBeDefined()
  })

  it('rejects when name not approved (422)', async () => {
    const repo = makeRepo({
      findNameById: jest.fn().mockResolvedValue({ id: 'n1', seriesId: 's1', status: NameStatus.IN_REVIEW })
    })
    const svc = new ChapterCreationService(repo as never)
    await expect(svc.create('u1', body)).rejects.toBeDefined()
  })

  it('rejects when name not in series (422)', async () => {
    const repo = makeRepo({
      findNameById: jest.fn().mockResolvedValue({ id: 'n1', seriesId: 'other', status: NameStatus.APPROVED })
    })
    const svc = new ChapterCreationService(repo as never)
    await expect(svc.create('u1', body)).rejects.toBeDefined()
  })

  it('rejects duplicate chapter number (409)', async () => {
    const repo = makeRepo({ findChapterByNumber: jest.fn().mockResolvedValue({ id: 'cX' }) })
    const svc = new ChapterCreationService(repo as never)
    await expect(svc.create('u1', body)).rejects.toBeDefined()
  })
})
