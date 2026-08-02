import { DeadlineWarningCron } from './deadline-warning.cron'
import { TaskMessages } from 'src/modules/task/task.messages'

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
      findChaptersNearDeadline: jest
        .fn()
        .mockResolvedValue([
          { chapterId: '0123456789abcdef01234567', seriesId: 'S1', chapterNumber: 12, seriesTitle: 'Bến Cảng Vô Danh' }
        ]),
      findSeriesRecipients: jest.fn().mockResolvedValue({ mangakaId: 'M1', editorId: null }),
      findTasksNearDeadline: jest.fn().mockResolvedValue([])
    }
    const queue = { enqueue: jest.fn().mockResolvedValue(undefined) }
    const cron = new DeadlineWarningCron(redis as never, repo as never, queue as never)

    await cron.run()

    expect(queue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: 'M1',
        referenceId: '0123456789abcdef01234567',
        referenceType: expect.stringMatching(/^DEADLINE_WARNING:\d{4}-\d{2}-\d{2}$/),
        content: 'Chương 12 — «Bến Cảng Vô Danh» sắp đến hạn nộp'
      })
    )
  })

  it('enqueues task deadline warnings for assistant and mangaka', async () => {
    const redis = { setNxEx: jest.fn().mockResolvedValue(true) }
    const repo = {
      findChaptersNearDeadline: jest.fn().mockResolvedValue([]),
      findSeriesRecipients: jest.fn(),
      findTasksNearDeadline: jest
        .fn()
        .mockResolvedValue([
          { taskId: 'T1', assistantId: 'A1', mangakaId: 'M1', taskType: 'BACKGROUND', pageNumber: 5, chapterNumber: 12 }
        ])
    }
    const queue = { enqueue: jest.fn().mockResolvedValue(undefined) }
    const cron = new DeadlineWarningCron(redis as never, repo as never, queue as never)

    await cron.run()

    expect(queue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: 'A1',
        referenceId: 'T1',
        referenceType: expect.stringMatching(/^TASK_DEADLINE_WARNING:\d{4}-\d{2}-\d{2}$/),
        content: 'Công việc vẽ nền (trang 5, chương 12) sắp đến hạn nộp'
      })
    )
    expect(queue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: 'M1',
        referenceId: 'T1',
        referenceType: expect.stringMatching(/^TASK_DEADLINE_WARNING:\d{4}-\d{2}-\d{2}$/),
        content: 'Công việc vẽ nền (trang 5, chương 12) sắp đến hạn nộp'
      })
    )
  })

  it('uses the shared Vietnamese label for every Specialization value', () => {
    expect(TaskMessages.specializationLabel).toEqual({
      BACKGROUND: 'vẽ nền',
      SCREENTONE: 'dán screentone',
      EFFECT_LINES: 'hiệu ứng',
      INKING: 'tô mực',
      COLORING: 'tô màu',
      LETTERING: 'đi chữ'
    })
  })

  it('falls back to a generic task label when taskType is null', async () => {
    const redis = { setNxEx: jest.fn().mockResolvedValue(true) }
    const repo = {
      findChaptersNearDeadline: jest.fn().mockResolvedValue([]),
      findSeriesRecipients: jest.fn(),
      findTasksNearDeadline: jest
        .fn()
        .mockResolvedValue([
          { taskId: 'T1', assistantId: 'A1', mangakaId: null, taskType: null, pageNumber: 5, chapterNumber: 12 }
        ])
    }
    const queue = { enqueue: jest.fn().mockResolvedValue(undefined) }
    const cron = new DeadlineWarningCron(redis as never, repo as never, queue as never)

    await cron.run()

    expect(queue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceId: 'T1',
        content: 'Công việc (trang 5, chương 12) sắp đến hạn nộp'
      })
    )
    const content = queue.enqueue.mock.calls[0][0].content
    expect(content).not.toContain('undefined')
    expect(content).not.toContain('null')
  })
})

describe('DeadlineWarningCron — cron hardening (audit 2026-07-11)', () => {
  it('repo scan failure is swallowed (no unhandled rejection)', async () => {
    const redis = { setNxEx: jest.fn().mockResolvedValue(true) }
    const repo = {
      findChaptersNearDeadline: jest.fn().mockRejectedValue(new Error('mongo down')),
      findTasksNearDeadline: jest.fn(),
      findSeriesRecipients: jest.fn()
    }
    const queue = { enqueue: jest.fn() }
    const cron = new DeadlineWarningCron(redis as never, repo as never, queue as never)
    await expect(cron.run()).resolves.toBeUndefined()
  })

  it('one failing chapter does not stop warnings for the rest', async () => {
    const redis = { setNxEx: jest.fn().mockResolvedValue(true) }
    const repo = {
      findChaptersNearDeadline: jest.fn().mockResolvedValue([
        { chapterId: 'c1', seriesId: 's1' },
        { chapterId: 'c2', seriesId: 's2' }
      ]),
      findTasksNearDeadline: jest.fn().mockResolvedValue([]),
      findSeriesRecipients: jest
        .fn()
        .mockRejectedValueOnce(new Error('blip'))
        .mockResolvedValueOnce({ mangakaId: 'm2', editorId: 'e2' })
    }
    const queue = { enqueue: jest.fn().mockResolvedValue(undefined) }
    const cron = new DeadlineWarningCron(redis as never, repo as never, queue as never)
    await expect(cron.run()).resolves.toBeUndefined()
    expect(queue.enqueue).toHaveBeenCalledTimes(2) // m2 + e2 của chapter c2 vẫn được cảnh báo
  })
})
