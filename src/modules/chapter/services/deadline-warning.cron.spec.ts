import { DeadlineWarningCron } from './deadline-warning.cron'
import { TaskMessages } from 'src/modules/task/task.messages'

const baseChapter = {
  chapterId: 'c1',
  seriesId: 's1',
  chapterNumber: 12,
  seriesTitle: 'Bến Cảng Vô Danh',
  publicationType: 'WEEKLY' as const,
  deadline: new Date(Date.now() + 20 * 3_600_000),
  mangakaId: 'M1',
  editorId: 'E1',
  progressPct: 0.5
}

describe('DeadlineWarningCron', () => {
  it('skips when Redis lock is not acquired', async () => {
    const redis = { setNxEx: jest.fn().mockResolvedValue(false) }
    const repo = { findChaptersForDeadlineScan: jest.fn(), findTasksNearDeadline: jest.fn() }
    const queue = { enqueue: jest.fn() }
    const cron = new DeadlineWarningCron(redis as never, repo as never, queue as never)

    await cron.run()

    expect(repo.findChaptersForDeadlineScan).not.toHaveBeenCalled()
  })

  it('không gửi khi mức cảnh báo là NONE (tiến độ đã đủ)', async () => {
    const redis = { setNxEx: jest.fn().mockResolvedValue(true) }
    const repo = {
      findChaptersForDeadlineScan: jest
        .fn()
        .mockResolvedValue([{ ...baseChapter, progressPct: 0.95, deadline: new Date(Date.now() + 36 * 3_600_000) }]),
      findTasksNearDeadline: jest.fn().mockResolvedValue([])
    }
    const queue = { enqueue: jest.fn().mockResolvedValue(undefined) }
    const cron = new DeadlineWarningCron(redis as never, repo as never, queue as never)

    await cron.run()

    expect(queue.enqueue).not.toHaveBeenCalled()
  })

  it('WEEKLY còn 20 giờ, tiến độ 50% → gửi mức RED cho tác giả và biên tập viên', async () => {
    const redis = { setNxEx: jest.fn().mockResolvedValue(true) }
    const repo = {
      findChaptersForDeadlineScan: jest.fn().mockResolvedValue([baseChapter]),
      findTasksNearDeadline: jest.fn().mockResolvedValue([])
    }
    const queue = { enqueue: jest.fn().mockResolvedValue(undefined) }
    const cron = new DeadlineWarningCron(redis as never, repo as never, queue as never)

    await cron.run()

    const refs = queue.enqueue.mock.calls.map((call) => (call[0] as { referenceType: string }).referenceType)
    expect(refs.every((ref) => ref.startsWith('DEADLINE_WARNING:RED:'))).toBe(true)
    const recipients = queue.enqueue.mock.calls.map((call) => (call[0] as { recipientId: string }).recipientId)
    expect(recipients).toEqual(expect.arrayContaining(['M1', 'E1']))
  })

  it('MONTHLY còn 100 giờ, tiến độ 50% → mức YELLOW (ngưỡng khác WEEKLY)', async () => {
    const redis = { setNxEx: jest.fn().mockResolvedValue(true) }
    const repo = {
      findChaptersForDeadlineScan: jest
        .fn()
        .mockResolvedValue([
          { ...baseChapter, publicationType: 'MONTHLY', deadline: new Date(Date.now() + 100 * 3_600_000) }
        ]),
      findTasksNearDeadline: jest.fn().mockResolvedValue([])
    }
    const queue = { enqueue: jest.fn().mockResolvedValue(undefined) }
    const cron = new DeadlineWarningCron(redis as never, repo as never, queue as never)

    await cron.run()

    const refs = queue.enqueue.mock.calls.map((call) => (call[0] as { referenceType: string }).referenceType)
    expect(refs.every((ref) => ref.startsWith('DEADLINE_WARNING:YELLOW:'))).toBe(true)
  })

  it('nội dung ổn định khi chỉ tiến độ thay đổi (chống spam do dedupeKey băm content)', async () => {
    const redis = { setNxEx: jest.fn().mockResolvedValue(true) }
    const base = { ...baseChapter, editorId: null as string | null }
    const repo = {
      findChaptersForDeadlineScan: jest.fn().mockResolvedValue([{ ...base, progressPct: 0.5 }]),
      findTasksNearDeadline: jest.fn().mockResolvedValue([])
    }
    const queue = { enqueue: jest.fn().mockResolvedValue(undefined) }
    const cron = new DeadlineWarningCron(redis as never, repo as never, queue as never)

    await cron.run()
    const first = (queue.enqueue.mock.calls[0][0] as { content: string }).content

    jest.clearAllMocks()
    repo.findChaptersForDeadlineScan.mockResolvedValue([{ ...base, progressPct: 0.7 }])
    await cron.run()
    const second = (queue.enqueue.mock.calls[0][0] as { content: string }).content
    expect(second).toBe(first)
  })

  it('ngưỡng WEEKLY chặt hơn MONTHLY: cùng mốc 60 giờ, WEEKLY im lặng MONTHLY còn YELLOW', async () => {
    const redis = { setNxEx: jest.fn().mockResolvedValue(true) }
    const deadline = new Date(Date.now() + 60 * 3_600_000)
    const base = { ...baseChapter, editorId: null, deadline, progressPct: 0.5 }
    const repo = {
      findChaptersForDeadlineScan: jest.fn().mockResolvedValue([{ ...base, publicationType: 'WEEKLY' }]),
      findTasksNearDeadline: jest.fn().mockResolvedValue([])
    }
    const queue = { enqueue: jest.fn().mockResolvedValue(undefined) }
    const cron = new DeadlineWarningCron(redis as never, repo as never, queue as never)

    await cron.run()
    expect(queue.enqueue).not.toHaveBeenCalled()

    jest.clearAllMocks()
    repo.findChaptersForDeadlineScan.mockResolvedValue([{ ...base, publicationType: 'MONTHLY' }])
    await cron.run()
    expect(queue.enqueue).toHaveBeenCalled()
  })

  it('enqueues task deadline warnings for assistant and mangaka, dùng prefix theo overdue', async () => {
    const redis = { setNxEx: jest.fn().mockResolvedValue(true) }
    const repo = {
      findChaptersForDeadlineScan: jest.fn().mockResolvedValue([]),
      findTasksNearDeadline: jest.fn().mockResolvedValue([
        {
          taskId: 'T1',
          assistantId: 'A1',
          mangakaId: 'M1',
          taskType: 'BACKGROUND',
          pageNumber: 5,
          chapterNumber: 12,
          isOverdue: false
        }
      ])
    }
    const queue = { enqueue: jest.fn().mockResolvedValue(undefined) }
    const cron = new DeadlineWarningCron(redis as never, repo as never, queue as never)

    await cron.run()

    expect(queue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: 'A1',
        referenceType: expect.stringMatching(/^TASK_DEADLINE_WARNING:\d{4}-\d{2}-\d{2}$/)
      })
    )
  })

  it('task quá hạn dùng TASK_DEADLINE_OVERDUE', async () => {
    const redis = { setNxEx: jest.fn().mockResolvedValue(true) }
    const repo = {
      findChaptersForDeadlineScan: jest.fn().mockResolvedValue([]),
      findTasksNearDeadline: jest.fn().mockResolvedValue([
        {
          taskId: 'T2',
          assistantId: 'A2',
          mangakaId: null,
          taskType: 'INKING',
          pageNumber: 1,
          chapterNumber: 2,
          isOverdue: true
        }
      ])
    }
    const queue = { enqueue: jest.fn().mockResolvedValue(undefined) }
    const cron = new DeadlineWarningCron(redis as never, repo as never, queue as never)

    await cron.run()

    expect(queue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: 'A2',
        referenceType: expect.stringMatching(/^TASK_DEADLINE_OVERDUE:\d{4}-\d{2}-\d{2}$/)
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
      findChaptersForDeadlineScan: jest.fn().mockResolvedValue([]),
      findTasksNearDeadline: jest.fn().mockResolvedValue([
        {
          taskId: 'T1',
          assistantId: 'A1',
          mangakaId: null,
          taskType: null,
          pageNumber: 5,
          chapterNumber: 12,
          isOverdue: false
        }
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
      findChaptersForDeadlineScan: jest.fn().mockRejectedValue(new Error('mongo down')),
      findTasksNearDeadline: jest.fn()
    }
    const queue = { enqueue: jest.fn() }
    const cron = new DeadlineWarningCron(redis as never, repo as never, queue as never)
    await expect(cron.run()).resolves.toBeUndefined()
  })

  it('one failing chapter does not stop warnings for the rest', async () => {
    const redis = { setNxEx: jest.fn().mockResolvedValue(true) }
    // Tạo chapter có `deadline` không hợp lệ để computeWarningLevel không ném,
    // đồng thời mock chapter thứ 2 có `mangakaId` thiếu để kiểm tra vòng lặp tiếp tục.
    const repo = {
      findChaptersForDeadlineScan: jest.fn().mockResolvedValue([
        { ...baseChapter, chapterId: 'c1', progressPct: 0.1, deadline: new Date(NaN) },
        {
          ...baseChapter,
          chapterId: 'c2',
          mangakaId: null as unknown as string,
          editorId: 'e2',
          progressPct: 0.1,
          deadline: new Date(Date.now() - 3_600_000)
        }
      ]),
      findTasksNearDeadline: jest.fn().mockResolvedValue([])
    }
    const queue = { enqueue: jest.fn().mockResolvedValue(undefined) }
    const cron = new DeadlineWarningCron(redis as never, repo as never, queue as never)
    await expect(cron.run()).resolves.toBeUndefined()
    // c1 (NaN deadline) sinh NONE → không enqueue; c2 (CRITICAL) sinh thông báo cho e2 → 1 call duy nhất.
    expect(queue.enqueue).toHaveBeenCalledTimes(1)
    expect(queue.enqueue).toHaveBeenCalledWith(expect.objectContaining({ recipientId: 'e2' }))
  })
})
