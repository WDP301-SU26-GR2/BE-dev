import { NameStatus, ProposalStatus, SeriesStatus } from '@prisma/client'
import { SeriesStateService } from './series-state.service'

function makeRepo(overrides: Record<string, unknown> = {}) {
  return {
    findById: jest.fn(),
    findNameById: jest.fn(),
    updateStatusWithHistory: jest
      .fn()
      .mockImplementation((id, entry) => Promise.resolve({ id, status: entry.toStatus })),
    ...overrides
  }
}

describe('SeriesStateService.transition', () => {
  it('allows a valid transition and records history', async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue({ id: 's1', status: SeriesStatus.DRAFT }) })
    const svc = new SeriesStateService(repo as never)
    const res = await svc.transition('s1', SeriesStatus.IN_REVIEW, { changedBy: 'u1' })
    expect(repo.updateStatusWithHistory).toHaveBeenCalledWith('s1', {
      fromStatus: SeriesStatus.DRAFT,
      toStatus: SeriesStatus.IN_REVIEW,
      changedBy: 'u1',
      reason: undefined
    })
    expect(res).toMatchObject({ status: SeriesStatus.IN_REVIEW })
  })

  it('rejects an invalid transition with 409', async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue({ id: 's1', status: SeriesStatus.DRAFT }) })
    const svc = new SeriesStateService(repo as never)
    await expect(svc.transition('s1', SeriesStatus.PITCHED, { changedBy: 'u1' })).rejects.toBeDefined()
    expect(repo.updateStatusWithHistory).not.toHaveBeenCalled()
  })

  it('throws when series not found', async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(null) })
    const svc = new SeriesStateService(repo as never)
    await expect(svc.transition('sX', SeriesStatus.IN_REVIEW, { changedBy: 'u1' })).rejects.toBeDefined()
  })
})

describe('SeriesStateService.tryAdvanceToReadyToPitch', () => {
  const inReviewBothApproved = {
    id: 's1',
    status: SeriesStatus.IN_REVIEW,
    proposal: { status: ProposalStatus.PROPOSAL_APPROVED, nameId: 'n1' }
  }

  it('advances to READY_TO_PITCH when proposal approved and name approved', async () => {
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue(inReviewBothApproved),
      findNameById: jest.fn().mockResolvedValue({ id: 'n1', status: NameStatus.APPROVED })
    })
    const svc = new SeriesStateService(repo as never)
    await svc.tryAdvanceToReadyToPitch('s1', 'editor1')
    expect(repo.updateStatusWithHistory).toHaveBeenCalledWith('s1', {
      fromStatus: SeriesStatus.IN_REVIEW,
      toStatus: SeriesStatus.READY_TO_PITCH,
      changedBy: 'editor1',
      reason: undefined
    })
  })

  it('does nothing when name not yet approved', async () => {
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue(inReviewBothApproved),
      findNameById: jest.fn().mockResolvedValue({ id: 'n1', status: NameStatus.IN_REVIEW })
    })
    const svc = new SeriesStateService(repo as never)
    await svc.tryAdvanceToReadyToPitch('s1', 'editor1')
    expect(repo.updateStatusWithHistory).not.toHaveBeenCalled()
  })

  it('does nothing when proposal not approved', async () => {
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue({
        id: 's1',
        status: SeriesStatus.IN_REVIEW,
        proposal: { status: ProposalStatus.PROPOSAL_REVIEW, nameId: 'n1' }
      })
    })
    const svc = new SeriesStateService(repo as never)
    await svc.tryAdvanceToReadyToPitch('s1', 'editor1')
    expect(repo.updateStatusWithHistory).not.toHaveBeenCalled()
  })
})
