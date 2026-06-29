import { TaskCascadeService } from './task-cascade.service'

describe('TaskCascadeService', () => {
  const repo = {
    findPageWithOwner: jest.fn(),
    findTaskStatusesByPage: jest.fn(),
    findTaskStatusesByChapter: jest.fn(),
    findManuscriptStatusByChapter: jest.fn()
  }
  const pageState = { transition: jest.fn() }
  const manuscriptState = { transition: jest.fn() }
  const service = new TaskCascadeService(repo as never, pageState as never, manuscriptState as never)
  beforeEach(() => jest.clearAllMocks())

  const TASK = { id: 't', pageId: 'p' }

  it('page → COMPOSITE_READY when all page tasks submitted & page IN_PROGRESS', async () => {
    repo.findPageWithOwner.mockResolvedValue({ id: 'p', chapterId: 'c', status: 'IN_PROGRESS', chapter: { seriesId: 's', series: { mangakaId: 'm' } } })
    repo.findTaskStatusesByPage.mockResolvedValue(['SUBMITTED', 'APPROVED'])
    repo.findTaskStatusesByChapter.mockResolvedValue(['SUBMITTED', 'NOTREACHED' as never]) // chapter not all submitted
    await service.fireOnSubmitted(TASK as never, 'm')
    expect(pageState.transition).toHaveBeenCalledWith('p', 'COMPOSITE_READY')
    expect(manuscriptState.transition).not.toHaveBeenCalled()
  })

  it('manuscript → COMPOSITE_REVIEW when all chapter tasks submitted & manuscript IN_PRODUCTION', async () => {
    repo.findPageWithOwner.mockResolvedValue({ id: 'p', chapterId: 'c', status: 'COMPOSITE_READY', chapter: { seriesId: 's', series: { mangakaId: 'm' } } })
    repo.findTaskStatusesByPage.mockResolvedValue(['APPROVED'])
    repo.findTaskStatusesByChapter.mockResolvedValue(['SUBMITTED', 'APPROVED'])
    repo.findManuscriptStatusByChapter.mockResolvedValue({ status: 'IN_PRODUCTION' })
    await service.fireOnSubmitted(TASK as never, 'm')
    expect(manuscriptState.transition).toHaveBeenCalledWith('c', 'COMPOSITE_REVIEW', { changedBy: 'm' })
  })

  it('swallows transition error (no throw)', async () => {
    repo.findPageWithOwner.mockResolvedValue({ id: 'p', chapterId: 'c', status: 'IN_PROGRESS', chapter: { seriesId: 's', series: { mangakaId: 'm' } } })
    repo.findTaskStatusesByPage.mockResolvedValue(['SUBMITTED'])
    repo.findTaskStatusesByChapter.mockResolvedValue(['SUBMITTED'])
    repo.findManuscriptStatusByChapter.mockResolvedValue({ status: 'PUBLISHED' })
    pageState.transition.mockRejectedValue(new Error('invalid'))
    await expect(service.fireOnSubmitted(TASK as never, 'm')).resolves.toBeUndefined()
  })
})
