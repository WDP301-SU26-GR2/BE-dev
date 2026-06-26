import { NotificationType } from '@prisma/client'
import { ChapterPublishedListener } from './chapter-notification.listener'

describe('ChapterPublishedListener', () => {
  it('resolves recipients and enqueues notifications for mangaka and editor', async () => {
    const repo = { findSeriesRecipients: jest.fn().mockResolvedValue({ mangakaId: 'M1', editorId: 'E1' }) }
    const queue = { enqueue: jest.fn().mockResolvedValue(undefined) }
    const listener = new ChapterPublishedListener(repo as never, queue as never)

    await listener.handle({ chapterId: 'C1', seriesId: 'S1', publishedAt: '2026-06-26T00:00:00Z' })

    expect(repo.findSeriesRecipients).toHaveBeenCalledWith('S1')
    expect(queue.enqueue).toHaveBeenCalledTimes(2)
    expect(queue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: 'M1',
        type: NotificationType.SYSTEM,
        referenceId: 'C1',
        referenceType: 'CHAPTER'
      })
    )
  })

  it('does not enqueue when series does not exist', async () => {
    const repo = { findSeriesRecipients: jest.fn().mockResolvedValue(null) }
    const queue = { enqueue: jest.fn() }
    const listener = new ChapterPublishedListener(repo as never, queue as never)

    await listener.handle({ chapterId: 'C1', seriesId: 'S1', publishedAt: 'x' })

    expect(queue.enqueue).not.toHaveBeenCalled()
  })
})
