import { PageStatus } from '@prisma/client'
import { PageStateService } from './page-state.service'

function makeRepo(page: unknown) {
  return {
    findPageById: jest.fn().mockResolvedValue(page),
    updatePageStatus: jest.fn().mockImplementation((id, status) => Promise.resolve({ id, status }))
  }
}

describe('PageStateService.transition', () => {
  it('allows a valid transition', async () => {
    const repo = makeRepo({ id: 'p1', status: PageStatus.NOT_STARTED })
    const svc = new PageStateService(repo as never)
    await svc.transition('p1', PageStatus.IN_PROGRESS)
    expect(repo.updatePageStatus).toHaveBeenCalledWith('p1', PageStatus.IN_PROGRESS)
  })

  it('rejects an invalid transition with 409', async () => {
    const repo = makeRepo({ id: 'p1', status: PageStatus.NOT_STARTED })
    const svc = new PageStateService(repo as never)
    await expect(svc.transition('p1', PageStatus.COMPLETED)).rejects.toBeDefined()
    expect(repo.updatePageStatus).not.toHaveBeenCalled()
  })

  it('throws when page not found', async () => {
    const repo = makeRepo(null)
    const svc = new PageStateService(repo as never)
    await expect(svc.transition('pX', PageStatus.IN_PROGRESS)).rejects.toBeDefined()
  })
})
