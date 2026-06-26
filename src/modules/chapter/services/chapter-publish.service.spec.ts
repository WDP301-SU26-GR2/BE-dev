import { ManuscriptStatus } from '@prisma/client'
import { DomainEvent } from 'src/core/events/domain-events'
import { ChapterPublishService } from './chapter-publish.service'

function makeDeps(series: Record<string, unknown>) {
  const repo = {
    findChapterById: jest.fn().mockResolvedValue({ id: 'c1', seriesId: 's1' }),
    findSeriesById: jest.fn().mockResolvedValue(series),
    findManuscriptByChapterId: jest.fn().mockResolvedValue({ id: 'm1', status: ManuscriptStatus.READY_FOR_PRINT })
  }
  const manuscriptState = {
    transition: jest.fn().mockResolvedValue({ id: 'c1', publishedAt: new Date('2026-06-24T00:00:00.000Z') })
  }
  const eventBus = { emit: jest.fn() }
  const notification = { notify: jest.fn().mockResolvedValue({}) }
  return { repo, manuscriptState, eventBus, notification }
}

describe('ChapterPublishService.publish', () => {
  it('publishes when no co-owner: PUBLISHED + emit chapter.published + notify', async () => {
    const { repo, manuscriptState, eventBus, notification } = makeDeps({
      id: 's1',
      mangakaId: 'u1',
      editorId: 'e1',
      coOwnerId: null
    })
    const svc = new ChapterPublishService(
      repo as never,
      manuscriptState as never,
      eventBus as never,
      notification as never
    )
    await svc.publish('e1', 'c1')
    expect(manuscriptState.transition).toHaveBeenCalledWith('c1', ManuscriptStatus.PUBLISHED, { changedBy: 'e1' })
    expect(eventBus.emit).toHaveBeenCalledWith(
      DomainEvent.ChapterPublished,
      expect.objectContaining({ chapterId: 'c1', seriesId: 's1' })
    )
    expect(notification.notify).toHaveBeenCalledWith(expect.objectContaining({ recipientId: 'u1' }))
  })

  it('routes to AWAITING_CO_OWNER_APPROVAL when series has co-owner (no event yet)', async () => {
    const { repo, manuscriptState, eventBus, notification } = makeDeps({
      id: 's1',
      mangakaId: 'u1',
      editorId: 'e1',
      coOwnerId: 'a1'
    })
    const svc = new ChapterPublishService(
      repo as never,
      manuscriptState as never,
      eventBus as never,
      notification as never
    )
    await svc.publish('e1', 'c1')
    expect(manuscriptState.transition).toHaveBeenCalledWith('c1', ManuscriptStatus.AWAITING_CO_OWNER_APPROVAL, {
      changedBy: 'e1'
    })
    expect(eventBus.emit).not.toHaveBeenCalled()
    expect(notification.notify).toHaveBeenCalledWith(expect.objectContaining({ recipientId: 'a1' }))
  })

  it('non-editor cannot publish (403)', async () => {
    const { repo, manuscriptState, eventBus, notification } = makeDeps({ id: 's1', mangakaId: 'u1', editorId: 'e1' })
    const svc = new ChapterPublishService(
      repo as never,
      manuscriptState as never,
      eventBus as never,
      notification as never
    )
    await expect(svc.publish('other', 'c1')).rejects.toBeDefined()
  })
})
