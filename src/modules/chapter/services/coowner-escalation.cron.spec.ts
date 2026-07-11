import { CoOwnerEscalationCron } from './coowner-escalation.cron'

function make(overdue: any[]) {
  const redis = { setNxEx: jest.fn().mockResolvedValue(true) }
  const repo = {
    findOverdueCoOwnerApprovals: jest.fn().mockResolvedValue(overdue),
    findBoardMemberIds: jest.fn().mockResolvedValue(['b1']),
    updateCoOwnerApproval: jest.fn().mockResolvedValue(undefined),
    findChapterById: jest.fn().mockResolvedValue({ id: 'c1', seriesId: 's1' }),
    findSeriesById: jest.fn().mockResolvedValue({ id: 's1', editorId: 'e1' })
  }
  const queue = { enqueue: jest.fn().mockResolvedValue(undefined) }
  const cron = new CoOwnerEscalationCron(redis as never, repo as never, queue as never)
  return { cron, redis, repo, queue }
}

describe('CoOwnerEscalationCron — cron hardening (audit 2026-07-11)', () => {
  it('escalates overdue approvals and notifies board + editor', async () => {
    const d = make([{ id: 'a1', chapterId: 'c1' }])
    await d.cron.run()
    expect(d.repo.updateCoOwnerApproval).toHaveBeenCalledWith('a1', expect.objectContaining({ status: 'ESCALATED' }))
    expect(d.queue.enqueue).toHaveBeenCalledTimes(2) // board b1 + editor e1
  })

  it('one failing approval does not stop the rest (per-item resilience)', async () => {
    const d = make([
      { id: 'a1', chapterId: 'c1' },
      { id: 'a2', chapterId: 'c2' }
    ])
    d.repo.updateCoOwnerApproval = jest
      .fn()
      .mockRejectedValueOnce(new Error('mongo blip'))
      .mockResolvedValueOnce(undefined)
    await expect(d.cron.run()).resolves.toBeUndefined()
    expect(d.repo.updateCoOwnerApproval).toHaveBeenCalledTimes(2)
    expect(d.queue.enqueue).toHaveBeenCalled() // a2 vẫn được escalate + notify
  })

  it('repo scan failure is swallowed (no unhandled rejection)', async () => {
    const d = make([])
    d.repo.findOverdueCoOwnerApprovals = jest.fn().mockRejectedValue(new Error('mongo down'))
    await expect(d.cron.run()).resolves.toBeUndefined()
  })

  it('skips when the Redis lock is not acquired', async () => {
    const d = make([])
    d.redis.setNxEx.mockResolvedValue(false)
    await d.cron.run()
    expect(d.repo.findOverdueCoOwnerApprovals).not.toHaveBeenCalled()
  })
})
