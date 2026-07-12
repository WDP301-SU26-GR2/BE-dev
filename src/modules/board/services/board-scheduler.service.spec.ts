import { BoardSchedulerService } from './board-scheduler.service'

function makeScheduler(expiredActive: any[]) {
  const boardRepo = {
    findExpiredUpcomingSessions: jest.fn().mockResolvedValue([]),
    findExpiredActiveSessions: jest.fn().mockResolvedValue(expiredActive)
  }
  const stateService = { transition: jest.fn().mockResolvedValue({}) }
  const boardService = { concludeSession: jest.fn().mockResolvedValue({}) }
  const redis = { setNxEx: jest.fn().mockResolvedValue(true) }
  const scheduler = new BoardSchedulerService(
    boardRepo as never,
    stateService as never,
    boardService as never,
    redis as never
  )
  return { scheduler, boardRepo, boardService, redis }
}

describe('BoardSchedulerService auto-conclude (Fix-2 G-7)', () => {
  it('concludes every ACTIVE session past endTime with a null actor', async () => {
    const d = makeScheduler([
      { id: 's1', title: 'A' },
      { id: 's2', title: 'B' }
    ])
    await d.scheduler.handleAutoStartSessions()
    expect(d.boardService.concludeSession).toHaveBeenCalledWith('s1', null, null)
    expect(d.boardService.concludeSession).toHaveBeenCalledWith('s2', null, null)
  })

  it('a failing session does not stop the others', async () => {
    const d = makeScheduler([
      { id: 's1', title: 'A' },
      { id: 's2', title: 'B' }
    ])
    d.boardService.concludeSession.mockRejectedValueOnce(new Error('boom'))
    await expect(d.scheduler.handleAutoStartSessions()).resolves.toBeUndefined()
    expect(d.boardService.concludeSession).toHaveBeenCalledTimes(2)
  })

  it('no expired ACTIVE sessions -> no conclude calls', async () => {
    const d = makeScheduler([])
    await d.scheduler.handleAutoStartSessions()
    expect(d.boardService.concludeSession).not.toHaveBeenCalled()
  })
})

describe('BoardSchedulerService — cron hardening (audit 2026-07-11)', () => {
  it('skips the tick when the Redis lock is not acquired (multi-instance)', async () => {
    const d = makeScheduler([])
    d.redis.setNxEx.mockResolvedValue(false)
    await d.scheduler.handleAutoStartSessions()
    expect(d.boardRepo.findExpiredUpcomingSessions).not.toHaveBeenCalled()
  })

  it('repo scan failure is swallowed (no unhandled rejection)', async () => {
    const d = makeScheduler([])
    d.boardRepo.findExpiredUpcomingSessions.mockRejectedValue(new Error('mongo down'))
    await expect(d.scheduler.handleAutoStartSessions()).resolves.toBeUndefined()
  })
})
