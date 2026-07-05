import { AuditEntityType, PageStatus } from '@prisma/client'
import { PageStateService } from './page-state.service'

function makeRepo(page: unknown) {
  return {
    findPageById: jest.fn().mockResolvedValue(page),
    updatePageStatus: jest.fn().mockImplementation((id, status) => Promise.resolve({ id, status }))
  }
}

function makeAudit() {
  return { record: jest.fn().mockResolvedValue(undefined) }
}

describe('PageStateService.transition', () => {
  it('allows a valid transition', async () => {
    const repo = makeRepo({ id: 'p1', status: PageStatus.NOT_STARTED })
    const audit = makeAudit()
    const svc = new PageStateService(repo as never, audit as never)
    await svc.transition('p1', PageStatus.IN_PROGRESS, 'u1')
    expect(repo.updatePageStatus).toHaveBeenCalledWith('p1', PageStatus.IN_PROGRESS)
    expect(audit.record).toHaveBeenCalledWith({
      actorId: 'u1',
      entityType: AuditEntityType.PAGE,
      entityId: 'p1',
      action: 'TRANSITION',
      fromState: PageStatus.NOT_STARTED,
      toState: PageStatus.IN_PROGRESS
    })
  })

  it('rejects an invalid transition with 409', async () => {
    const repo = makeRepo({ id: 'p1', status: PageStatus.NOT_STARTED })
    const svc = new PageStateService(repo as never, makeAudit() as never)
    await expect(svc.transition('p1', PageStatus.COMPLETED)).rejects.toBeDefined()
    expect(repo.updatePageStatus).not.toHaveBeenCalled()
  })

  it('throws when page not found', async () => {
    const repo = makeRepo(null)
    const svc = new PageStateService(repo as never, makeAudit() as never)
    await expect(svc.transition('pX', PageStatus.IN_PROGRESS)).rejects.toBeDefined()
  })
})
