import { ManuscriptStatus, SeriesStatus } from '@prisma/client'
import { DomainEvent } from 'src/core/events/domain-events'
import { ChapterPublishService } from './chapter-publish.service'
import { asCacheService, makeCacheServiceMock } from 'src/infrastructure/redis/cache.service.mock'

function makeDeps(series: Record<string, unknown>) {
  const repo = {
    findChapterById: jest.fn().mockResolvedValue({ id: 'c1', seriesId: 's1', chapterNumber: 7, hold: null }),
    findSeriesById: jest.fn().mockResolvedValue(series),
    findManuscriptByChapterId: jest.fn().mockResolvedValue({ id: 'm1', status: ManuscriptStatus.READY_FOR_PRINT }),
    findExecutedContractBySeriesId: jest.fn().mockResolvedValue({ id: 'k1' }),
    countPagesNotCompleted: jest.fn().mockResolvedValue(0),
    createCoOwnerApproval: jest.fn().mockResolvedValue({})
  }
  const manuscriptState = {
    transition: jest.fn().mockResolvedValue({ id: 'c1', publishedAt: new Date('2026-06-24T00:00:00.000Z') })
  }
  const eventBus = { emit: jest.fn() }
  const notification = { notify: jest.fn().mockResolvedValue({}), notifySafe: jest.fn().mockResolvedValue(undefined) }
  const appConfig = { get: jest.fn().mockResolvedValue({ coOwnerApprovalGraceDays: 7 }) }
  return { repo, manuscriptState, eventBus, notification, appConfig }
}

describe('ChapterPublishService.publish', () => {
  it('publishes when no co-owner: PUBLISHED + emit chapter.published without inline notify', async () => {
    const { repo, manuscriptState, eventBus, notification, appConfig } = makeDeps({
      id: 's1',
      mangakaId: 'u1',
      editorId: 'e1',
      coOwnerId: null
    })
    const svc = new ChapterPublishService(
      repo as never,
      manuscriptState as never,
      eventBus as never,
      notification as never,
      appConfig as never,
      asCacheService(makeCacheServiceMock())
    )
    await svc.publish('e1', 'c1')
    expect(manuscriptState.transition).toHaveBeenCalledWith('c1', ManuscriptStatus.PUBLISHED, { changedBy: 'e1' })
    expect(eventBus.emit).toHaveBeenCalledWith(
      DomainEvent.ChapterPublished,
      expect.objectContaining({ chapterId: 'c1', seriesId: 's1', chapterNumber: 7 })
    )
    expect(notification.notify).not.toHaveBeenCalled()
    expect(notification.notifySafe).not.toHaveBeenCalled()
  })

  it('routes to AWAITING_CO_OWNER_APPROVAL when series has co-owner (no event yet)', async () => {
    const { repo, manuscriptState, eventBus, notification, appConfig } = makeDeps({
      id: 's1',
      mangakaId: 'u1',
      editorId: 'e1',
      coOwnerId: 'a1'
    })
    const svc = new ChapterPublishService(
      repo as never,
      manuscriptState as never,
      eventBus as never,
      notification as never,
      appConfig as never,
      asCacheService(makeCacheServiceMock())
    )
    await svc.publish('e1', 'c1')
    expect(manuscriptState.transition).toHaveBeenCalledWith('c1', ManuscriptStatus.AWAITING_CO_OWNER_APPROVAL, {
      changedBy: 'e1'
    })
    expect(eventBus.emit).not.toHaveBeenCalled()
    expect(notification.notifySafe).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: 'a1', referenceType: 'MANUSCRIPT_AWAITING_CO_OWNER' })
    )
    // Part 1: publish creates the ChapterCoOwnerApproval record (deadline from AppConfig grace days).
    expect(repo.createCoOwnerApproval).toHaveBeenCalledWith(
      expect.objectContaining({ chapterId: 'c1', coOwnerId: 'a1' })
    )
  })

  it('throws ContractNotExecuted when series has no FULLY_EXECUTED contract', async () => {
    const { repo, manuscriptState, eventBus, notification, appConfig } = makeDeps({
      id: 's1',
      mangakaId: 'u1',
      editorId: 'e1',
      coOwnerId: null
    })
    repo.findExecutedContractBySeriesId = jest.fn().mockResolvedValue(null)
    const svc = new ChapterPublishService(
      repo as never,
      manuscriptState as never,
      eventBus as never,
      notification as never,
      appConfig as never,
      asCacheService(makeCacheServiceMock())
    )
    await expect(svc.publish('e1', 'c1')).rejects.toBeDefined()
    expect(manuscriptState.transition).not.toHaveBeenCalled()
    expect(eventBus.emit).not.toHaveBeenCalled()
  })

  it('throws PagesNotReadyForPublish (409) when a page is not COMPLETED', async () => {
    const { repo, manuscriptState, eventBus, notification, appConfig } = makeDeps({
      id: 's1',
      mangakaId: 'u1',
      editorId: 'e1',
      coOwnerId: null
    })
    repo.countPagesNotCompleted = jest.fn().mockResolvedValue(2)
    const svc = new ChapterPublishService(
      repo as never,
      manuscriptState as never,
      eventBus as never,
      notification as never,
      appConfig as never,
      asCacheService(makeCacheServiceMock())
    )
    await expect(svc.publish('e1', 'c1')).rejects.toMatchObject({ status: 409 })
    expect(manuscriptState.transition).not.toHaveBeenCalled()
    expect(eventBus.emit).not.toHaveBeenCalled()
  })

  it('publishes when all pages COMPLETED (countPagesNotCompleted = 0)', async () => {
    const { repo, manuscriptState, eventBus, notification, appConfig } = makeDeps({
      id: 's1',
      mangakaId: 'u1',
      editorId: 'e1',
      coOwnerId: null
    })
    const svc = new ChapterPublishService(
      repo as never,
      manuscriptState as never,
      eventBus as never,
      notification as never,
      appConfig as never,
      asCacheService(makeCacheServiceMock())
    )
    await expect(svc.publish('e1', 'c1')).resolves.toBeDefined()
    expect(repo.countPagesNotCompleted).toHaveBeenCalledWith('c1')
    expect(manuscriptState.transition).toHaveBeenCalledWith('c1', ManuscriptStatus.PUBLISHED, { changedBy: 'e1' })
  })

  it('non-editor cannot publish (403)', async () => {
    const { repo, manuscriptState, eventBus, notification, appConfig } = makeDeps({
      id: 's1',
      mangakaId: 'u1',
      editorId: 'e1'
    })
    const svc = new ChapterPublishService(
      repo as never,
      manuscriptState as never,
      eventBus as never,
      notification as never,
      appConfig as never,
      asCacheService(makeCacheServiceMock())
    )
    await expect(svc.publish('other', 'c1')).rejects.toBeDefined()
  })
})

describe('ChapterPublishService.publish — ending phase (Fix-1 G-1)', () => {
  function makeEndingDeps(status: SeriesStatus, coOwnerId: string | null = null) {
    const repo = {
      findChapterById: jest.fn().mockResolvedValue({ id: 'c1', seriesId: 's1', chapterNumber: 7, hold: null }),
      findSeriesById: jest.fn().mockResolvedValue({
        id: 's1',
        mangakaId: 'u1',
        editorId: 'e1',
        status,
        coOwnerId
      }),
      findManuscriptByChapterId: jest.fn().mockResolvedValue({ id: 'm1', status: ManuscriptStatus.READY_FOR_PRINT }),
      findExecutedContractBySeriesId: jest.fn().mockResolvedValue(null),
      countPagesNotCompleted: jest.fn().mockResolvedValue(0),
      createCoOwnerApproval: jest.fn().mockResolvedValue({})
    }
    const manuscriptState = {
      transition: jest.fn().mockResolvedValue({ id: 'c1', publishedAt: new Date('2026-06-24T00:00:00.000Z') })
    }
    const eventBus = { emit: jest.fn() }
    const notification = { notify: jest.fn(), notifySafe: jest.fn().mockResolvedValue(undefined) }
    const appConfig = { get: jest.fn().mockResolvedValue({ coOwnerApprovalGraceDays: 7 }) }
    return { repo, manuscriptState, eventBus, notification, appConfig }
  }

  it.each([SeriesStatus.CANCELLING, SeriesStatus.COMPLETING])(
    'series %s + NO executed contract → publish THÀNH CÔNG (gate bypass)',
    async (status) => {
      const { repo, manuscriptState, eventBus, notification, appConfig } = makeEndingDeps(status)
      const svc = new ChapterPublishService(
        repo as never,
        manuscriptState as never,
        eventBus as never,
        notification as never,
        appConfig as never,
        asCacheService(makeCacheServiceMock())
      )
      await expect(svc.publish('e1', 'c1')).resolves.toBeDefined()
      // Gate đã bypass → KHÔNG gọi findExecutedContractBySeriesId
      expect(repo.findExecutedContractBySeriesId).not.toHaveBeenCalled()
      // Vẫn publish bình thường
      expect(manuscriptState.transition).toHaveBeenCalledWith('c1', ManuscriptStatus.PUBLISHED, { changedBy: 'e1' })
      expect(eventBus.emit).toHaveBeenCalledWith(
        DomainEvent.ChapterPublished,
        expect.objectContaining({ chapterId: 'c1', seriesId: 's1' })
      )
    }
  )

  it('series SERIALIZED + no contract → vẫn 409 ContractNotExecuted (gate intact)', async () => {
    const { repo, manuscriptState, eventBus, notification, appConfig } = makeEndingDeps(SeriesStatus.SERIALIZED)
    const svc = new ChapterPublishService(
      repo as never,
      manuscriptState as never,
      eventBus as never,
      notification as never,
      appConfig as never,
      asCacheService(makeCacheServiceMock())
    )
    await expect(svc.publish('e1', 'c1')).rejects.toMatchObject({ status: 409 })
    expect(manuscriptState.transition).not.toHaveBeenCalled()
    expect(eventBus.emit).not.toHaveBeenCalled()
  })

  it('series CANCELLING + coOwnerId → vẫn route AWAITING_CO_OWNER_APPROVAL (bypass không ảnh hưởng co-owner gate)', async () => {
    const { repo, manuscriptState, eventBus, notification, appConfig } = makeEndingDeps(SeriesStatus.CANCELLING, 'a1')
    const svc = new ChapterPublishService(
      repo as never,
      manuscriptState as never,
      eventBus as never,
      notification as never,
      appConfig as never,
      asCacheService(makeCacheServiceMock())
    )
    await svc.publish('e1', 'c1')
    expect(manuscriptState.transition).toHaveBeenCalledWith(
      'c1',
      ManuscriptStatus.AWAITING_CO_OWNER_APPROVAL,
      expect.objectContaining({ changedBy: 'e1' })
    )
    expect(eventBus.emit).not.toHaveBeenCalled()
  })
})
