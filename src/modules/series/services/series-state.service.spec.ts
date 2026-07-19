import { SeriesStatus } from '@prisma/client'
import { SeriesStateService } from './series-state.service'

function makeRepo(overrides: Record<string, unknown> = {}) {
  return {
    findById: jest.fn(),
    updateStatusWithHistory: jest
      .fn()
      .mockImplementation((id, entry) => Promise.resolve({ id, status: entry.toStatus })),
    ...overrides
  }
}

function makeNameRepo(overrides: Record<string, unknown> = {}) {
  return {
    findNameById: jest.fn(),
    ...overrides
  }
}

function makeAudit() {
  return { record: jest.fn().mockResolvedValue(undefined) }
}

describe('SeriesStateService.transition', () => {
  it('allows a valid transition and records history', async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue({ id: 's1', status: SeriesStatus.DRAFT }) })
    const audit = makeAudit()
    const svc = new SeriesStateService(repo as never, makeNameRepo() as never, audit as never)
    const res = await svc.transition('s1', SeriesStatus.IN_REVIEW, { changedBy: 'u1', reason: 'ready' })
    expect(repo.updateStatusWithHistory).toHaveBeenCalledWith('s1', {
      fromStatus: SeriesStatus.DRAFT,
      toStatus: SeriesStatus.IN_REVIEW,
      changedBy: 'u1',
      reason: 'ready'
    })
    expect(audit.record).toHaveBeenCalledWith({
      actorId: 'u1',
      entityType: 'SERIES',
      entityId: 's1',
      action: 'TRANSITION',
      fromState: SeriesStatus.DRAFT,
      toState: SeriesStatus.IN_REVIEW,
      reason: 'ready'
    })
    expect(res).toMatchObject({ status: SeriesStatus.IN_REVIEW })
  })

  it('rejects an invalid transition with 409', async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue({ id: 's1', status: SeriesStatus.DRAFT }) })
    const svc = new SeriesStateService(repo as never, makeNameRepo() as never, makeAudit() as never)
    await expect(svc.transition('s1', SeriesStatus.PITCHED, { changedBy: 'u1' })).rejects.toBeDefined()
    expect(repo.updateStatusWithHistory).not.toHaveBeenCalled()
  })

  it('throws when series not found', async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(null) })
    const svc = new SeriesStateService(repo as never, makeNameRepo() as never, makeAudit() as never)
    await expect(svc.transition('sX', SeriesStatus.IN_REVIEW, { changedBy: 'u1' })).rejects.toBeDefined()
  })

  it('Spec 22: allows every reopen/rework edge and still rejects PITCHED → DRAFT', async () => {
    const allowed: Array<[SeriesStatus, SeriesStatus]> = [
      [SeriesStatus.REJECTED, SeriesStatus.IN_REVIEW],
      [SeriesStatus.REJECTED, SeriesStatus.WITHDRAWN],
      [SeriesStatus.REJECTED, SeriesStatus.ABANDONED],
      [SeriesStatus.ABANDONED, SeriesStatus.DRAFT],
      [SeriesStatus.WITHDRAWN, SeriesStatus.DRAFT]
    ]

    for (const [fromStatus, toStatus] of allowed) {
      const repo = makeRepo({ findById: jest.fn().mockResolvedValue({ id: 's1', status: fromStatus }) })
      const svc = new SeriesStateService(repo as never, makeNameRepo() as never, makeAudit() as never)

      await expect(svc.transition('s1', toStatus, { changedBy: 'u1' })).resolves.toMatchObject({ status: toStatus })
      expect(repo.updateStatusWithHistory).toHaveBeenCalledWith(
        's1',
        expect.objectContaining({ fromStatus, toStatus, changedBy: 'u1' })
      )
    }

    const repo = makeRepo({ findById: jest.fn().mockResolvedValue({ id: 's1', status: SeriesStatus.PITCHED }) })
    const svc = new SeriesStateService(repo as never, makeNameRepo() as never, makeAudit() as never)
    await expect(svc.transition('s1', SeriesStatus.DRAFT, { changedBy: 'u1' })).rejects.toBeDefined()
    expect(repo.updateStatusWithHistory).not.toHaveBeenCalled()
  })
})

describe('SeriesStateService.tryAdvanceToReadyToPitch', () => {
  const inReviewBothApproved = {
    id: 's1',
    status: SeriesStatus.IN_REVIEW,
    proposal: { status: 'PROPOSAL_APPROVED', nameId: 'n1' }
  }

  it('advances to READY_TO_PITCH when proposal approved and name approved', async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(inReviewBothApproved) })
    const nameRepo = makeNameRepo({ findNameById: jest.fn().mockResolvedValue({ id: 'n1', status: 'APPROVED' }) })
    const svc = new SeriesStateService(repo as never, nameRepo as never, makeAudit() as never)
    await svc.tryAdvanceToReadyToPitch('s1', 'editor1')
    expect(repo.updateStatusWithHistory).toHaveBeenCalledWith('s1', {
      fromStatus: SeriesStatus.IN_REVIEW,
      toStatus: SeriesStatus.READY_TO_PITCH,
      changedBy: 'editor1',
      reason: undefined
    })
  })

  it('does nothing when name not yet approved', async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(inReviewBothApproved) })
    const nameRepo = makeNameRepo({ findNameById: jest.fn().mockResolvedValue({ id: 'n1', status: 'IN_REVIEW' }) })
    const svc = new SeriesStateService(repo as never, nameRepo as never, makeAudit() as never)
    await svc.tryAdvanceToReadyToPitch('s1', 'editor1')
    expect(repo.updateStatusWithHistory).not.toHaveBeenCalled()
  })

  it('does nothing when proposal not approved', async () => {
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue({
        id: 's1',
        status: SeriesStatus.IN_REVIEW,
        proposal: { status: 'PROPOSAL_REVIEW', nameId: 'n1' }
      })
    })
    const svc = new SeriesStateService(repo as never, makeNameRepo() as never, makeAudit() as never)
    await svc.tryAdvanceToReadyToPitch('s1', 'editor1')
    expect(repo.updateStatusWithHistory).not.toHaveBeenCalled()
  })
})
