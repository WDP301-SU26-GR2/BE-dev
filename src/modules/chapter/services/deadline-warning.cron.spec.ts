import { DeadlineWarningCron } from './deadline-warning.cron'

describe('DeadlineWarningCron', () => {
  it('skips when Redis lock is not acquired', async () => {
    const redis = { setNxEx: jest.fn().mockResolvedValue(false) }
    const repo = { findChaptersNearDeadline: jest.fn(), findSeriesRecipients: jest.fn() }
    const queue = { enqueue: jest.fn() }
    const cron = new DeadlineWarningCron(redis as never, repo as never, queue as never)

    await cron.run()

    expect(repo.findChaptersNearDeadline).not.toHaveBeenCalled()
  })

  it('enqueues warning with day scoped referenceType', async () => {
    const redis = { setNxEx: jest.fn().mockResolvedValue(true) }
    const repo = {
      findChaptersNearDeadline: jest.fn().mockResolvedValue([{ chapterId: 'C1', seriesId: 'S1' }]),
      findSeriesRecipients: jest.fn().mockResolvedValue({ mangakaId: 'M1', editorId: null }),
      findTasksNearDeadline: jest.fn().mockResolvedValue([])
    }
    const queue = { enqueue: jest.fn().mockResolvedValue(undefined) }
    const cron = new DeadlineWarningCron(redis as never, repo as never, queue as never)

    await cron.run()

    expect(queue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: 'M1',
        referenceId: 'C1',
        referenceType: expect.stringMatching(/^DEADLINE_WARNING:\d{4}-\d{2}-\d{2}$/)
      })
    )
  })

  it('enqueues task deadline warnings for assistant and mangaka', async () => {
    const redis = { setNxEx: jest.fn().mockResolvedValue(true) }
    const repo = {
      findChaptersNearDeadline: jest.fn().mockResolvedValue([]),
      findSeriesRecipients: jest.fn(),
      findTasksNearDeadline: jest.fn().mockResolvedValue([{ taskId: 'T1', assistantId: 'A1', mangakaId: 'M1' }])
    }
    const queue = { enqueue: jest.fn().mockResolvedValue(undefined) }
    const cron = new DeadlineWarningCron(redis as never, repo as never, queue as never)

    await cron.run()

    expect(queue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: 'A1',
        referenceId: 'T1',
        referenceType: expect.stringMatching(/^TASK_DEADLINE_WARNING:\d{4}-\d{2}-\d{2}$/)
      })
    )
    expect(queue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: 'M1',
        referenceId: 'T1',
        referenceType: expect.stringMatching(/^TASK_DEADLINE_WARNING:\d{4}-\d{2}-\d{2}$/)
      })
    )
  })
})
