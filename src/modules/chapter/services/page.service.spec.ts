import { ManuscriptStatus, PageStatus } from '@prisma/client'
import { PageService } from './page.service'

function makeDeps(over: Record<string, unknown> = {}) {
  const repo = {
    findChapterById: jest.fn().mockResolvedValue({ id: 'c1', seriesId: 's1' }),
    findSeriesById: jest.fn().mockResolvedValue({ id: 's1', mangakaId: 'u1' }),
    findManuscriptByChapterId: jest.fn().mockResolvedValue({ id: 'm1', status: ManuscriptStatus.DRAFT }),
    createPage: jest.fn().mockResolvedValue({ id: 'p1', chapterId: 'c1', status: PageStatus.NOT_STARTED }),
    findPageById: jest.fn().mockResolvedValue({ id: 'p1', chapterId: 'c1', status: PageStatus.NOT_STARTED }),
    findPagesByChapterId: jest.fn().mockResolvedValue([]),
    updatePage: jest.fn().mockResolvedValue({ id: 'p1' }),
    ...over
  }
  const manuscriptState = { transition: jest.fn().mockResolvedValue({}) }
  const pageState = { transition: jest.fn().mockResolvedValue({ id: 'p1' }) }
  return { repo, manuscriptState, pageState }
}

describe('PageService.createPage', () => {
  it('creates page and moves Manuscript DRAFT→IN_PRODUCTION on first page', async () => {
    const { repo, manuscriptState, pageState } = makeDeps()
    const svc = new PageService(repo as never, manuscriptState as never, pageState as never)
    await svc.createPage('u1', 'c1', { pageNumber: 1, originalFile: 'uploads/u1/a.png' })
    expect(repo.createPage).toHaveBeenCalledWith('c1', { pageNumber: 1, originalFile: 'uploads/u1/a.png' })
    expect(manuscriptState.transition).toHaveBeenCalledWith('c1', ManuscriptStatus.IN_PRODUCTION, { changedBy: 'u1' })
  })

  it('does not transition when manuscript already IN_PRODUCTION', async () => {
    const { repo, manuscriptState, pageState } = makeDeps({
      findManuscriptByChapterId: jest.fn().mockResolvedValue({ id: 'm1', status: ManuscriptStatus.IN_PRODUCTION })
    })
    const svc = new PageService(repo as never, manuscriptState as never, pageState as never)
    await svc.createPage('u1', 'c1', { pageNumber: 2, originalFile: 'k' })
    expect(manuscriptState.transition).not.toHaveBeenCalled()
  })

  it('non-owner cannot create page (403)', async () => {
    const { repo, manuscriptState, pageState } = makeDeps({
      findSeriesById: jest.fn().mockResolvedValue({ id: 's1', mangakaId: 'someone' })
    })
    const svc = new PageService(repo as never, manuscriptState as never, pageState as never)
    await expect(svc.createPage('u1', 'c1', { pageNumber: 1, originalFile: 'k' })).rejects.toBeDefined()
  })

  it('updatePage transitions page status when provided', async () => {
    const { repo, manuscriptState, pageState } = makeDeps()
    const svc = new PageService(repo as never, manuscriptState as never, pageState as never)
    await svc.updatePage('u1', 'p1', { compositeFile: 'k2', status: PageStatus.IN_PROGRESS })
    expect(repo.updatePage).toHaveBeenCalledWith('p1', { compositeFile: 'k2' })
    expect(pageState.transition).toHaveBeenCalledWith('p1', PageStatus.IN_PROGRESS)
  })
})
