import { PageStatus } from '@prisma/client'
import { InvalidPageTransitionException } from '../errors/chapter.errors'
import { PageStateService } from './page-state.service'

describe('PageStateService (Spec 18)', () => {
  const repo = {
    findPageById: jest.fn(),
    updatePageStatus: jest.fn(),
    findPagesByChapterId: jest.fn()
  } as any
  const audit = { record: jest.fn() } as any
  const service = new PageStateService(repo, audit)

  beforeEach(() => jest.clearAllMocks())

  it.each([
    [PageStatus.DRAFT, PageStatus.COMPLETED],
    [PageStatus.COMPLETED, PageStatus.REVISING],
    [PageStatus.REVISING, PageStatus.COMPLETED]
  ])('allows %s -> %s', async (from, to) => {
    repo.findPageById.mockResolvedValue({ id: 'p1', status: from })
    repo.updatePageStatus.mockResolvedValue({ id: 'p1', status: to })
    await service.transition('p1', to, 'u1')
    expect(repo.updatePageStatus).toHaveBeenCalledWith('p1', to)
  })

  it('rejects DRAFT -> REVISING', async () => {
    repo.findPageById.mockResolvedValue({ id: 'p1', status: PageStatus.DRAFT })
    await expect(service.transition('p1', PageStatus.REVISING, 'u1')).rejects.toBe(InvalidPageTransitionException)
  })

  it('transitionAllInChapter flips only pages in the from set and returns count', async () => {
    repo.findPagesByChapterId.mockResolvedValue([
      { id: 'p1', status: PageStatus.REVISING },
      { id: 'p2', status: PageStatus.DRAFT },
      { id: 'p3', status: PageStatus.COMPLETED }
    ])
    repo.findPageById.mockImplementation((id: string) =>
      Promise.resolve(
        {
          p1: { id: 'p1', status: PageStatus.REVISING },
          p2: { id: 'p2', status: PageStatus.DRAFT },
          p3: { id: 'p3', status: PageStatus.COMPLETED }
        }[id]
      )
    )
    repo.updatePageStatus.mockResolvedValue({})

    const count = await service.transitionAllInChapter(
      'c1',
      [PageStatus.REVISING, PageStatus.DRAFT],
      PageStatus.COMPLETED,
      'u1'
    )

    expect(count).toBe(2)
    expect(repo.updatePageStatus).toHaveBeenCalledWith('p1', PageStatus.COMPLETED)
    expect(repo.updatePageStatus).toHaveBeenCalledWith('p2', PageStatus.COMPLETED)
    expect(repo.updatePageStatus).not.toHaveBeenCalledWith('p3', PageStatus.COMPLETED)
  })
})
