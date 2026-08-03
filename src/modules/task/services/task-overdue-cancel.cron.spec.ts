import { TaskStatus } from '@prisma/client'
import { TaskOverdueCancelCron } from './task-overdue-cancel.cron'

describe('TaskOverdueCancelCron', () => {
  const build = (overdue: unknown[], graceHours = 24) => {
    const redis = { setNxEx: jest.fn().mockResolvedValue(true) }
    const repo = { findOverdueForCancel: jest.fn().mockResolvedValue(overdue) }
    const state = { transition: jest.fn().mockResolvedValue({}) }
    const appConfig = { get: jest.fn().mockResolvedValue({ taskOverdueGraceHours: graceHours }) }
    const queue = { enqueue: jest.fn().mockResolvedValue(undefined) }
    return {
      redis,
      repo,
      state,
      queue,
      cron: new TaskOverdueCancelCron(redis as never, repo as never, state as never, appConfig as never, queue as never)
    }
  }

  const item = { taskId: 't1', assistantId: 'a1', mangakaId: 'm1', pageNumber: 3, chapterNumber: 7 }

  beforeEach(() => jest.clearAllMocks())

  it('không lấy được khoá Redis → thoát, không đụng gì', async () => {
    const { redis, repo, cron } = build([item])
    redis.setNxEx.mockResolvedValue(false)
    await cron.run()
    expect(repo.findOverdueForCancel).not.toHaveBeenCalled()
  })

  it('cutoff = now trừ đi số giờ ân hạn', async () => {
    const { repo, cron } = build([], 48)
    const before = Date.now()
    await cron.run()
    const cutoff = repo.findOverdueForCancel.mock.calls[0][0] as Date
    const delta = before - cutoff.getTime()
    expect(delta).toBeGreaterThanOrEqual(48 * 3_600_000 - 5_000)
    expect(delta).toBeLessThanOrEqual(48 * 3_600_000 + 5_000)
  })

  it('huỷ qua TaskStateService, KHÔNG ghi thẳng Prisma, actor là hệ thống (null)', async () => {
    const { state, cron } = build([item])
    await cron.run()
    expect(state.transition).toHaveBeenCalledWith('t1', TaskStatus.CANCELLED, expect.any(String), null)
  })

  it('báo cho cả trợ lý và tác giả', async () => {
    const { queue, cron } = build([item])
    await cron.run()
    const recipients = queue.enqueue.mock.calls.map((call) => (call[0] as { recipientId: string }).recipientId)
    expect(recipients).toEqual(expect.arrayContaining(['a1', 'm1']))
  })

  it('một task lỗi không chặn các task sau', async () => {
    const { state, queue, cron } = build([item, { ...item, taskId: 't2' }])
    state.transition.mockRejectedValueOnce(new Error('lỗi DB'))
    await cron.run()
    expect(state.transition).toHaveBeenCalledTimes(2)
    expect(queue.enqueue).toHaveBeenCalled()
  })
})
