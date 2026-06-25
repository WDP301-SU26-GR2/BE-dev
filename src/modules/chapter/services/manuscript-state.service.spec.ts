import { ManuscriptStatus } from '@prisma/client'
import { ManuscriptStateService } from './manuscript-state.service'

function makeRepo(manuscript: unknown) {
  return {
    findManuscriptByChapterId: jest.fn().mockResolvedValue(manuscript),
    applyManuscriptTransition: jest.fn().mockImplementation((cid, mid, e) => Promise.resolve({ id: cid, to: e.to }))
  }
}

describe('ManuscriptStateService.transition', () => {
  it('allows a valid transition and records history', async () => {
    const repo = makeRepo({ id: 'm1', status: ManuscriptStatus.DRAFT })
    const svc = new ManuscriptStateService(repo as never)
    await svc.transition('c1', ManuscriptStatus.IN_PRODUCTION, { changedBy: 'u1' })
    expect(repo.applyManuscriptTransition).toHaveBeenCalledWith('c1', 'm1', {
      from: ManuscriptStatus.DRAFT,
      to: ManuscriptStatus.IN_PRODUCTION,
      changedBy: 'u1',
      reason: undefined
    })
  })

  it('rejects an invalid transition with 409', async () => {
    const repo = makeRepo({ id: 'm1', status: ManuscriptStatus.DRAFT })
    const svc = new ManuscriptStateService(repo as never)
    await expect(svc.transition('c1', ManuscriptStatus.PUBLISHED, { changedBy: 'u1' })).rejects.toBeDefined()
    expect(repo.applyManuscriptTransition).not.toHaveBeenCalled()
  })

  it('throws when manuscript not found', async () => {
    const repo = makeRepo(null)
    const svc = new ManuscriptStateService(repo as never)
    await expect(svc.transition('cX', ManuscriptStatus.IN_PRODUCTION, { changedBy: 'u1' })).rejects.toBeDefined()
  })
})
