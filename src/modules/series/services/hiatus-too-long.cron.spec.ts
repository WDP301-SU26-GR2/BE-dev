import { HiatusTooLongCron } from './hiatus-too-long.cron'

function make() {
  const redisService = { setNxEx: jest.fn().mockResolvedValue(true) }
  const seriesRepository = {
    findHiatusStartedBefore: jest.fn().mockResolvedValue([]),
    findBoardMemberIds: jest.fn().mockResolvedValue(['b1'])
  }
  const appConfigService = { get: jest.fn().mockResolvedValue({ hiatusTooLongDays: 30 }) }
  const notificationQueue = { enqueue: jest.fn().mockResolvedValue(undefined) }
  const cron = new HiatusTooLongCron(
    redisService as never,
    seriesRepository as never,
    appConfigService as never,
    notificationQueue as never
  )
  return { cron, redisService, seriesRepository, appConfigService, notificationQueue }
}

describe('HiatusTooLongCron', () => {
  it('lock not acquired → no work', async () => {
    const { cron, redisService, seriesRepository, appConfigService, notificationQueue } = make()
    redisService.setNxEx.mockResolvedValue(false)
    await cron.run()
    expect(seriesRepository.findHiatusStartedBefore).not.toHaveBeenCalled()
    expect(appConfigService.get).not.toHaveBeenCalled()
    expect(notificationQueue.enqueue).not.toHaveBeenCalled()
  })

  it('overdue hiatus → notify editor + board', async () => {
    const { cron, seriesRepository, notificationQueue } = make()
    seriesRepository.findHiatusStartedBefore.mockResolvedValue([{ id: 's1', editorId: 'e1' }])
    await cron.run()
    const recipients: string[] = notificationQueue.enqueue.mock.calls.map(
      (c: unknown[]) => (c[0] as { recipientId: string }).recipientId
    )
    expect(recipients).toEqual(expect.arrayContaining(['e1', 'b1']))
    expect(notificationQueue.enqueue.mock.calls[0][0].referenceType).toMatch(/^SERIES_HIATUS_TOO_LONG/)
    expect(notificationQueue.enqueue.mock.calls[0][0].referenceId).toBe('s1')
  })

  it('overdue hiatus with no editorId → only board', async () => {
    const { cron, seriesRepository, notificationQueue } = make()
    seriesRepository.findHiatusStartedBefore.mockResolvedValue([{ id: 's2', editorId: null }])
    await cron.run()
    const recipients: string[] = notificationQueue.enqueue.mock.calls.map(
      (c: unknown[]) => (c[0] as { recipientId: string }).recipientId
    )
    expect(recipients).toEqual(['b1'])
  })

  it('no overdue series → no notifications', async () => {
    const { cron, seriesRepository, notificationQueue } = make()
    seriesRepository.findHiatusStartedBefore.mockResolvedValue([])
    await cron.run()
    expect(notificationQueue.enqueue).not.toHaveBeenCalled()
  })

  it('uses AppConfig hiatusTooLongDays to compute cutoff', async () => {
    const { cron, appConfigService, seriesRepository } = make()
    appConfigService.get.mockResolvedValue({ hiatusTooLongDays: 7 })
    const before = Date.now() - 7 * 86_400_000
    await cron.run()
    expect(seriesRepository.findHiatusStartedBefore).toHaveBeenCalledTimes(1)
    const cutoff = seriesRepository.findHiatusStartedBefore.mock.calls[0][0] as Date
    const after = Date.now() - 7 * 86_400_000
    expect(cutoff.getTime()).toBeGreaterThanOrEqual(before - 1000)
    expect(cutoff.getTime()).toBeLessThanOrEqual(after + 1000)
  })
})

describe('HiatusTooLongCron — cron hardening (audit 2026-07-11)', () => {
  it('repo/config failure is swallowed (no unhandled rejection)', async () => {
    const d = make()
    d.seriesRepository.findHiatusStartedBefore.mockRejectedValue(new Error('mongo down'))
    await expect(d.cron.run()).resolves.toBeUndefined()
  })
})
