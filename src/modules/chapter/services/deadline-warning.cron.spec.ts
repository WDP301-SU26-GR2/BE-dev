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
      findSeriesRecipients: jest.fn().mockResolvedValue({ mangakaId: 'M1', editorId: null })
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
})
