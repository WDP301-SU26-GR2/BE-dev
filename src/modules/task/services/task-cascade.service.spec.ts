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
    repo.findPageWithOwner.mockResolvedValue({
      id: 'p',
      chapterId: 'c',
      status: 'IN_PROGRESS',
      chapter: { seriesId: 's', series: { mangakaId: 'm' } }
    })
    repo.findTaskStatusesByPage.mockResolvedValue(['SUBMITTED', 'APPROVED'])
    repo.findTaskStatusesByChapter.mockResolvedValue(['SUBMITTED', 'NOTREACHED' as never]) // chapter not all submitted
    await service.fireOnSubmitted(TASK as never, 'm')
    expect(pageState.transition).toHaveBeenCalledWith('p', 'COMPOSITE_READY')
    expect(manuscriptState.transition).not.toHaveBeenCalled()
  })

  it('manuscript → COMPOSITE_REVIEW when all chapter tasks submitted & manuscript IN_PRODUCTION', async () => {
    repo.findPageWithOwner.mockResolvedValue({
      id: 'p',
      chapterId: 'c',
      status: 'COMPOSITE_READY',
      chapter: { seriesId: 's', series: { mangakaId: 'm' } }
    })
    repo.findTaskStatusesByPage.mockResolvedValue(['APPROVED'])
    repo.findTaskStatusesByChapter.mockResolvedValue(['SUBMITTED', 'APPROVED'])
    repo.findManuscriptStatusByChapter.mockResolvedValue({ status: 'IN_PRODUCTION' })
    await service.fireOnSubmitted(TASK as never, 'm')
    expect(manuscriptState.transition).toHaveBeenCalledWith('c', 'COMPOSITE_REVIEW', { changedBy: 'm' })
  })

  // PA-04: chapter đang hold → cascade skip toàn bộ (không transition page/manuscript)
  it('skips entirely when chapter is on hold', async () => {
    repo.findPageWithOwner.mockResolvedValue({
      id: 'p',
      chapterId: 'c',
      status: 'IN_PROGRESS',
      chapter: { seriesId: 's', hold: { reason: 'sick' }, series: { mangakaId: 'm' } }
    })
    await service.fireOnSubmitted(TASK as never, 'm')
    expect(repo.findTaskStatusesByPage).not.toHaveBeenCalled()
    expect(pageState.transition).not.toHaveBeenCalled()
    expect(manuscriptState.transition).not.toHaveBeenCalled()
  })

  // PA-03/PA-12: CANCELLED bị lọc khỏi mẫu số — 1 task hủy KHÔNG chặn cascade vĩnh viễn
  it('ignores CANCELLED tasks in the all-submitted denominator', async () => {
    repo.findPageWithOwner.mockResolvedValue({
      id: 'p',
      chapterId: 'c',
      status: 'IN_PROGRESS',
      chapter: { seriesId: 's', series: { mangakaId: 'm' } }
    })
    repo.findTaskStatusesByPage.mockResolvedValue(['SUBMITTED', 'CANCELLED'])
    repo.findTaskStatusesByChapter.mockResolvedValue(['SUBMITTED', 'CANCELLED'])
    repo.findManuscriptStatusByChapter.mockResolvedValue({ status: 'IN_PRODUCTION' })
    await service.fireOnSubmitted(TASK as never, 'm')
    expect(pageState.transition).toHaveBeenCalledWith('p', 'COMPOSITE_READY')
    expect(manuscriptState.transition).toHaveBeenCalledWith('c', 'COMPOSITE_REVIEW', { changedBy: 'm' })
  })

  // Mọi task của page đều CANCELLED → mẫu số rỗng → KHÔNG cascade (giữ semantics length > 0)
  it('does not cascade when all tasks are CANCELLED', async () => {
    repo.findPageWithOwner.mockResolvedValue({
      id: 'p',
      chapterId: 'c',
      status: 'IN_PROGRESS',
      chapter: { seriesId: 's', series: { mangakaId: 'm' } }
    })
    repo.findTaskStatusesByPage.mockResolvedValue(['CANCELLED', 'CANCELLED'])
    repo.findTaskStatusesByChapter.mockResolvedValue(['CANCELLED'])
    await service.fireOnSubmitted(TASK as never, 'm')
    expect(pageState.transition).not.toHaveBeenCalled()
    expect(manuscriptState.transition).not.toHaveBeenCalled()
  })

  it('swallows transition error (no throw)', async () => {
    repo.findPageWithOwner.mockResolvedValue({
      id: 'p',
      chapterId: 'c',
      status: 'IN_PROGRESS',
      chapter: { seriesId: 's', series: { mangakaId: 'm' } }
    })
    repo.findTaskStatusesByPage.mockResolvedValue(['SUBMITTED'])
    repo.findTaskStatusesByChapter.mockResolvedValue(['SUBMITTED'])
    repo.findManuscriptStatusByChapter.mockResolvedValue({ status: 'PUBLISHED' })
    pageState.transition.mockRejectedValue(new Error('invalid'))
    await expect(service.fireOnSubmitted(TASK as never, 'm')).resolves.toBeUndefined()
  })
})
