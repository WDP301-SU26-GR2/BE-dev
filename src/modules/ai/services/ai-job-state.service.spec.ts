import { AiJobStateService } from './ai-job-state.service'

describe('AiJobStateService', () => {
  const JID = 'a'.repeat(24)

  it('applies guarded transition and returns true when matched', async () => {
    const repo = { transitionStatus: jest.fn().mockResolvedValue(1) }
    const service = new AiJobStateService(repo as never)
    await expect(service.transition(JID, ['QUEUED'], 'RUNNING', { startedAt: new Date() })).resolves.toBe(true)
    expect(repo.transitionStatus).toHaveBeenCalledWith(JID, ['QUEUED'], 'RUNNING', expect.any(Object))
  })

  it('rejects invalid transition map without touching repo', async () => {
    const repo = { transitionStatus: jest.fn() }
    const service = new AiJobStateService(repo as never)
    await expect(service.transition(JID, ['SUCCEEDED'], 'RUNNING')).resolves.toBe(false)
    expect(repo.transitionStatus).not.toHaveBeenCalled()
  })

  it('returns false when guarded update matches 0 rows', async () => {
    const repo = { transitionStatus: jest.fn().mockResolvedValue(0) }
    const service = new AiJobStateService(repo as never)
    await expect(service.transition(JID, ['QUEUED'], 'FAILED')).resolves.toBe(false)
  })
})
