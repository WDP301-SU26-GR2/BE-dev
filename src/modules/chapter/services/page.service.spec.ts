import { ManuscriptStatus, NameStatus } from '@prisma/client'
import { PageNotEditableException } from '../errors/chapter.errors'
import { UpdatePageBodySchema } from '../schemas/chapter-schemas'
import { PageService } from './page.service'

function makeDeps(over: Record<string, unknown> = {}) {
  const repo = {
    findChapterById: jest.fn().mockResolvedValue({ id: 'c1', seriesId: 's1', nameId: 'n1' }),
    findSeriesById: jest.fn().mockResolvedValue({ id: 's1', mangakaId: 'u1' }),
    findManuscriptByChapterId: jest.fn().mockResolvedValue({ id: 'm1', status: ManuscriptStatus.DRAFT }),
    createPage: jest.fn().mockResolvedValue({ id: 'p1', chapterId: 'c1', status: 'DRAFT' }),
    findPageById: jest.fn().mockResolvedValue({ id: 'p1', chapterId: 'c1', status: 'DRAFT' }),
    findPagesByChapterId: jest.fn().mockResolvedValue([]),
    updatePage: jest.fn().mockResolvedValue({ id: 'p1' }),
    findNameStatus: jest.fn().mockResolvedValue(NameStatus.APPROVED),
    ...over
  }
  const manuscriptState = { transition: jest.fn().mockResolvedValue({}) }
  return { repo, manuscriptState }
}

describe('PageService.createPage', () => {
  it('creates page and moves Manuscript DRAFT→IN_PRODUCTION on first page', async () => {
    const { repo, manuscriptState } = makeDeps()
    const svc = new PageService(repo as never, manuscriptState as never)
    const result = await svc.createPage('u1', 'c1', { pageNumber: 1, originalFile: 'uploads/u1/a.png' })
    expect(result.status).toBe('DRAFT')
    expect(repo.createPage).toHaveBeenCalledWith('c1', { pageNumber: 1, originalFile: 'uploads/u1/a.png' })
    expect(manuscriptState.transition).toHaveBeenCalledWith('c1', ManuscriptStatus.IN_PRODUCTION, { changedBy: 'u1' })
  })

  it('does not transition when manuscript already IN_PRODUCTION', async () => {
    const { repo, manuscriptState } = makeDeps({
      findManuscriptByChapterId: jest.fn().mockResolvedValue({ id: 'm1', status: ManuscriptStatus.IN_PRODUCTION })
    })
    const svc = new PageService(repo as never, manuscriptState as never)
    await svc.createPage('u1', 'c1', { pageNumber: 2, originalFile: 'k' })
    expect(manuscriptState.transition).not.toHaveBeenCalled()
  })

  it('non-owner cannot create page (403)', async () => {
    const { repo, manuscriptState } = makeDeps({
      findSeriesById: jest.fn().mockResolvedValue({ id: 's1', mangakaId: 'someone' })
    })
    const svc = new PageService(repo as never, manuscriptState as never)
    await expect(svc.createPage('u1', 'c1', { pageNumber: 1, originalFile: 'k' })).rejects.toBeDefined()
  })

  it('updatePage only writes compositeFile and has no status transition path', async () => {
    const { repo, manuscriptState } = makeDeps()
    const svc = new PageService(repo as never, manuscriptState as never)
    await svc.updatePage('u1', 'p1', { compositeFile: 'k2' })
    expect(repo.updatePage).toHaveBeenCalledWith('p1', { compositeFile: 'k2' })
  })

  it('updatePage rejects a COMPLETED page after owner and hold checks', async () => {
    const { repo, manuscriptState } = makeDeps({
      findPageById: jest.fn().mockResolvedValue({ id: 'p1', chapterId: 'c1', status: 'COMPLETED' })
    })
    const svc = new PageService(repo as never, manuscriptState as never)

    await expect(svc.updatePage('u1', 'p1', { compositeFile: 'k2' })).rejects.toBe(PageNotEditableException)
    expect(repo.findChapterById).toHaveBeenCalledWith('c1')
    expect(repo.updatePage).not.toHaveBeenCalled()
  })

  it.each(['DRAFT', 'REVISING'])('updatePage allows editable status %s', async (status) => {
    const { repo, manuscriptState } = makeDeps({
      findPageById: jest
        .fn()
        .mockResolvedValueOnce({ id: 'p1', chapterId: 'c1', status })
        .mockResolvedValueOnce({ id: 'p1', chapterId: 'c1', status, compositeFile: 'k2' })
    })
    const svc = new PageService(repo as never, manuscriptState as never)

    await expect(svc.updatePage('u1', 'p1', { compositeFile: 'k2' })).resolves.toMatchObject({ status })
    expect(repo.updatePage).toHaveBeenCalledWith('p1', { compositeFile: 'k2' })
  })
})

describe('UpdatePageBodySchema', () => {
  it('strictly rejects the removed client-controlled status field', () => {
    expect(UpdatePageBodySchema.safeParse({ status: 'DRAFT' }).success).toBe(false)
  })
})

describe('PageService.createPage gate (Name APPROVED)', () => {
  const CH = '012345678901234567890123'

  it('chapter has no Name → 409 ChapterNameNotApproved', async () => {
    const { repo, manuscriptState } = makeDeps({
      findChapterById: jest.fn().mockResolvedValue({ id: CH, seriesId: 's1', nameId: null }),
      findSeriesById: jest.fn().mockResolvedValue({ id: 's1', mangakaId: 'u1' })
    })
    const svc = new PageService(repo as never, manuscriptState as never)
    await expect(svc.createPage('u1', CH, { pageNumber: 1, originalFile: 'f.png' })).rejects.toThrow()
  })

  it('Name not APPROVED → 409', async () => {
    const { repo, manuscriptState } = makeDeps({
      findChapterById: jest.fn().mockResolvedValue({ id: CH, seriesId: 's1', nameId: 'n1' }),
      findSeriesById: jest.fn().mockResolvedValue({ id: 's1', mangakaId: 'u1' }),
      findNameStatus: jest.fn().mockResolvedValue(NameStatus.IN_REVIEW)
    })
    const svc = new PageService(repo as never, manuscriptState as never)
    await expect(svc.createPage('u1', CH, { pageNumber: 1, originalFile: 'f.png' })).rejects.toThrow()
  })

  it('Name APPROVED → creates page + Manuscript IN_PRODUCTION', async () => {
    const { repo, manuscriptState } = makeDeps({
      findChapterById: jest.fn().mockResolvedValue({ id: CH, seriesId: 's1', nameId: 'n1' }),
      findSeriesById: jest.fn().mockResolvedValue({ id: 's1', mangakaId: 'u1' }),
      findManuscriptByChapterId: jest.fn().mockResolvedValue({ id: 'm1', status: ManuscriptStatus.DRAFT }),
      findNameStatus: jest.fn().mockResolvedValue(NameStatus.APPROVED)
    })
    const svc = new PageService(repo as never, manuscriptState as never)
    await svc.createPage('u1', CH, { pageNumber: 1, originalFile: 'uploads/u1/p1.png' })
    expect(repo.createPage).toHaveBeenCalledWith(CH, { pageNumber: 1, originalFile: 'uploads/u1/p1.png' })
    expect(manuscriptState.transition).toHaveBeenCalledWith(CH, ManuscriptStatus.IN_PRODUCTION, { changedBy: 'u1' })
  })
})
