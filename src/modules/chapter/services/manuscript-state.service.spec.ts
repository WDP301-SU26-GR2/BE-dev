import { AuditEntityType, ManuscriptStatus, PageStatus } from '@prisma/client'
import { ManuscriptStateService } from './manuscript-state.service'

function makeRepo(manuscript: unknown) {
  const repo = {
    findManuscriptByChapterId: jest.fn().mockResolvedValue(manuscript),
    applyManuscriptTransition: jest.fn().mockImplementation((cid, mid, e) => Promise.resolve({ id: cid, to: e.to })),
    withTransaction: jest.fn()
  }
  repo.withTransaction.mockImplementation(
    (work: (value: typeof repo) => Promise<unknown>): Promise<unknown> => work(repo)
  )
  return repo
}

function makeAudit() {
  return { record: jest.fn().mockResolvedValue(undefined) }
}

describe('ManuscriptStateService.transition', () => {
  it('allows a valid transition and records history', async () => {
    const repo = makeRepo({ id: 'm1', status: ManuscriptStatus.DRAFT })
    const audit = makeAudit()
    const svc = new ManuscriptStateService(repo as never, audit as never, {} as never)
    await svc.transition('c1', ManuscriptStatus.IN_PRODUCTION, { changedBy: 'u1', reason: 'pages started' })
    expect(repo.applyManuscriptTransition).toHaveBeenCalledWith('c1', 'm1', {
      from: ManuscriptStatus.DRAFT,
      to: ManuscriptStatus.IN_PRODUCTION,
      changedBy: 'u1',
      reason: 'pages started'
    })
    expect(audit.record).toHaveBeenCalledWith({
      actorId: 'u1',
      entityType: AuditEntityType.MANUSCRIPT,
      entityId: 'm1',
      action: 'TRANSITION',
      fromState: ManuscriptStatus.DRAFT,
      toState: ManuscriptStatus.IN_PRODUCTION,
      reason: 'pages started'
    })
  })

  it('rejects an invalid transition with 409', async () => {
    const repo = makeRepo({ id: 'm1', status: ManuscriptStatus.DRAFT })
    const svc = new ManuscriptStateService(repo as never, makeAudit() as never, {} as never)
    await expect(svc.transition('c1', ManuscriptStatus.PUBLISHED, { changedBy: 'u1' })).rejects.toBeDefined()
    expect(repo.applyManuscriptTransition).not.toHaveBeenCalled()
  })

  it('throws when manuscript not found', async () => {
    const repo = makeRepo(null)
    const svc = new ManuscriptStateService(repo as never, makeAudit() as never, {} as never)
    await expect(svc.transition('cX', ManuscriptStatus.IN_PRODUCTION, { changedBy: 'u1' })).rejects.toBeDefined()
  })
})

describe('ManuscriptStateService.transitionWithPages', () => {
  it('persists manuscript before pages in one transaction and audits after commit', async () => {
    const repo = makeRepo({ id: 'm1', status: ManuscriptStatus.IN_PRODUCTION })
    const audit = makeAudit()
    const pageState = {
      transitionAllUsing: jest
        .fn()
        .mockResolvedValue([{ pageId: 'p1', from: PageStatus.DRAFT, to: PageStatus.COMPLETED }]),
      recordAudits: jest.fn().mockResolvedValue(undefined)
    }
    const svc = new ManuscriptStateService(repo as never, audit as never, pageState as never)

    await svc.transitionWithPages(
      'c1',
      ManuscriptStatus.EDITOR_REVIEW,
      { changedBy: 'u1' },
      [PageStatus.DRAFT],
      PageStatus.COMPLETED
    )

    expect(repo.withTransaction).toHaveBeenCalledTimes(1)
    expect(repo.applyManuscriptTransition.mock.invocationCallOrder[0]).toBeLessThan(
      pageState.transitionAllUsing.mock.invocationCallOrder[0]
    )
    expect(pageState.recordAudits.mock.invocationCallOrder[0]).toBeGreaterThan(
      repo.withTransaction.mock.invocationCallOrder[0]
    )
    expect(audit.record.mock.invocationCallOrder[0]).toBeGreaterThan(repo.withTransaction.mock.invocationCallOrder[0])
  })

  it('does not audit when a page write fails and the transaction rejects', async () => {
    const repo = makeRepo({ id: 'm1', status: ManuscriptStatus.IN_PRODUCTION })
    const audit = makeAudit()
    const pageState = {
      transitionAllUsing: jest.fn().mockRejectedValue(new Error('page write failed')),
      recordAudits: jest.fn()
    }
    const svc = new ManuscriptStateService(repo as never, audit as never, pageState as never)

    await expect(
      svc.transitionWithPages(
        'c1',
        ManuscriptStatus.EDITOR_REVIEW,
        { changedBy: 'u1' },
        [PageStatus.DRAFT],
        PageStatus.COMPLETED
      )
    ).rejects.toThrow('page write failed')
    expect(audit.record).not.toHaveBeenCalled()
    expect(pageState.recordAudits).not.toHaveBeenCalled()
  })
})
