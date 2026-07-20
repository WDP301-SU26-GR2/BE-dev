import { ManuscriptStatus } from '@prisma/client'
import { ChapterCoOwnerService } from './chapter-coowner.service'
import { DomainEvent } from 'src/core/events/domain-events'
import { NotCoOwnerException, CoOwnerApprovalNotPendingException } from '../errors/chapter.errors'
import { asCacheService, makeCacheServiceMock } from 'src/infrastructure/redis/cache.service.mock'

const CHAPTER_ID = '507f1f77bcf86cd799439011'

function makeMocks() {
  return {
    chapterRepository: {
      findChapterById: jest.fn().mockResolvedValue({ id: CHAPTER_ID, seriesId: 's1', chapterNumber: 5 }),
      findSeriesById: jest.fn().mockResolvedValue({ id: 's1', coOwnerId: 'coA', mangakaId: 'mB', editorId: 'e1' }),
      findCoOwnerApprovalByChapterId: jest.fn().mockResolvedValue({ id: 'ap1', status: 'PENDING' }),
      updateCoOwnerApproval: jest.fn().mockResolvedValue({})
    },
    manuscriptStateService: {
      assertCanTransition: jest.fn().mockResolvedValue(undefined),
      transition: jest.fn().mockResolvedValue({ publishedAt: new Date('2026-07-07T00:00:00Z') }),
      transitionWithPages: jest.fn().mockResolvedValue({ status: ManuscriptStatus.EDITOR_REVISION })
    },
    eventBus: { emit: jest.fn() },
    notificationService: { notifySafe: jest.fn().mockResolvedValue(undefined) }
  }
}

function make(m: ReturnType<typeof makeMocks>) {
  return new ChapterCoOwnerService(
    m.chapterRepository as never,
    m.manuscriptStateService as never,
    m.eventBus as never,
    m.notificationService as never,
    asCacheService(makeCacheServiceMock())
  )
}

describe('ChapterCoOwnerService (A-CHP-06 / B-TRF-05)', () => {
  it('approve: co-owner approves → record APPROVED + Manuscript → PUBLISHED + emit chapter.published', async () => {
    const m = makeMocks()
    await make(m).approve('coA', CHAPTER_ID)

    expect(m.chapterRepository.updateCoOwnerApproval).toHaveBeenCalledWith(
      'ap1',
      expect.objectContaining({ status: 'APPROVED' })
    )
    expect(m.manuscriptStateService.transition).toHaveBeenCalledWith(
      CHAPTER_ID,
      ManuscriptStatus.PUBLISHED,
      expect.anything()
    )
    const emitted = m.eventBus.emit.mock.calls.find(([e]: any[]) => e === DomainEvent.ChapterPublished)
    expect(emitted).toBeDefined()
    expect(emitted[1]).toMatchObject({ chapterId: CHAPTER_ID, seriesId: 's1', chapterNumber: 5 })
  })

  it('reject: co-owner rejects → record REJECTED + Manuscript → EDITOR_REVISION (no publish event)', async () => {
    const m = makeMocks()
    await make(m).reject('coA', CHAPTER_ID, 'fix panel 3')

    expect(m.chapterRepository.updateCoOwnerApproval).toHaveBeenCalledWith(
      'ap1',
      expect.objectContaining({ status: 'REJECTED', rejectReason: 'fix panel 3' })
    )
    expect(m.manuscriptStateService.transitionWithPages).toHaveBeenCalledWith(
      CHAPTER_ID,
      ManuscriptStatus.EDITOR_REVISION,
      expect.objectContaining({ changedBy: 'coA', reason: 'fix panel 3' }),
      ['COMPLETED'],
      'REVISING'
    )
    expect(m.eventBus.emit.mock.calls.find(([e]: any[]) => e === DomainEvent.ChapterPublished)).toBeUndefined()
  })

  it('denies a caller who is not the co-owner (403)', async () => {
    const m = makeMocks()
    await expect(make(m).approve('someoneElse', CHAPTER_ID)).rejects.toBe(NotCoOwnerException)
    expect(m.manuscriptStateService.transition).not.toHaveBeenCalled()
    expect(m.manuscriptStateService.transitionWithPages).not.toHaveBeenCalled()
  })

  it('rejects when approval record is not PENDING (409)', async () => {
    const m = makeMocks()
    m.chapterRepository.findCoOwnerApprovalByChapterId.mockResolvedValue({ id: 'ap1', status: 'APPROVED' })
    await expect(make(m).approve('coA', CHAPTER_ID)).rejects.toBe(CoOwnerApprovalNotPendingException)
    expect(m.manuscriptStateService.transition).not.toHaveBeenCalled()
    expect(m.manuscriptStateService.transitionWithPages).not.toHaveBeenCalled()
  })
})
