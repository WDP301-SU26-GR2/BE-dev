import { ChapterStatus, DeadlineRequestStatus } from '@prisma/client'
import { DeadlineNegotiationService } from './deadline-negotiation.service'
import {
  DeadlineRequestAccessDeniedException,
  DeadlineRequestNotAllowedException,
  DeadlineRequestNotFoundException,
  NotCounterpartyException,
  OpenDeadlineRequestExistsException
} from '../errors/deadline.errors'

const CHAPTER_ID = '507f1f77bcf86cd799439012'
const REQUEST_ID = '507f1f77bcf86cd799439011'
const schedule = {
  id: '507f1f77bcf86cd799439013',
  currentDeadline: new Date('2026-07-01T00:00:00.000Z')
}
const chapter = { id: CHAPTER_ID, seriesId: '507f1f77bcf86cd799439014', status: ChapterStatus.IN_PRODUCTION }
const series = { id: chapter.seriesId, mangakaId: 'mangaka-1', editorId: 'editor-1' }
const baseRequest = {
  id: REQUEST_ID,
  scheduleId: schedule.id,
  chapterId: CHAPTER_ID,
  seriesId: chapter.seriesId,
  requestedBy: 'MANGAKA',
  lastProposedBy: 'MANGAKA',
  currentDeadline: schedule.currentDeadline,
  requestedDeadline: new Date('2026-07-02T00:00:00.000Z'),
  reason: 'Need polishing',
  affectsSlot: false,
  status: DeadlineRequestStatus.PROPOSED,
  boardReviewedBy: null,
  resolvedAt: null,
  createdAt: new Date('2026-06-30T00:00:00.000Z')
}

describe('DeadlineNegotiationService notifications', () => {
  const scheduleService = { getDeadlineContext: jest.fn() }
  const repo = { findById: jest.fn(), findOpenByChapter: jest.fn(), create: jest.fn() }
  const stateService = { transition: jest.fn() }
  const notificationService = { notifySafe: jest.fn().mockResolvedValue(undefined) }
  const service = new DeadlineNegotiationService(
    scheduleService as never,
    repo as never,
    stateService as never,
    notificationService as never
  )

  beforeEach(() => {
    jest.clearAllMocks()
    scheduleService.getDeadlineContext.mockResolvedValue({ chapter, series, schedule })
    repo.findOpenByChapter.mockResolvedValue(null)
    repo.create.mockResolvedValue(baseRequest)
  })

  it('create notifies counterparty with DEADLINE_PROPOSED', async () => {
    await service.create('mangaka-1', {
      chapterId: CHAPTER_ID,
      requestedDeadline: '2026-07-02T00:00:00.000Z',
      reason: 'Need polishing'
    })

    expect(notificationService.notifySafe).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: 'editor-1',
        type: 'DEADLINE',
        referenceType: 'DEADLINE_PROPOSED',
        content: expect.any(String)
      })
    )
  })

  it('counter notifies counterparty with DEADLINE_COUNTERED', async () => {
    repo.findById.mockResolvedValue(baseRequest)
    stateService.transition.mockResolvedValue({
      ...baseRequest,
      status: DeadlineRequestStatus.COUNTER_PROPOSED,
      lastProposedBy: 'EDITOR',
      requestedDeadline: new Date('2026-07-02T12:00:00.000Z')
    })

    await service.counter('editor-1', REQUEST_ID, {
      requestedDeadline: '2026-07-02T12:00:00.000Z',
      reason: 'Can approve noon'
    })

    expect(notificationService.notifySafe).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: 'mangaka-1',
        type: 'DEADLINE',
        referenceType: 'DEADLINE_COUNTERED',
        content: expect.any(String)
      })
    )
  })
})

describe('DeadlineNegotiationService guards & business rules', () => {
  const scheduleService = { getDeadlineContext: jest.fn() }
  const repo = { findById: jest.fn(), findOpenByChapter: jest.fn(), create: jest.fn() }
  const stateService = { transition: jest.fn() }
  const notificationService = { notifySafe: jest.fn().mockResolvedValue(undefined) }
  const service = new DeadlineNegotiationService(
    scheduleService as never,
    repo as never,
    stateService as never,
    notificationService as never
  )

  const createBody = { chapterId: CHAPTER_ID, requestedDeadline: '2026-07-02T00:00:00.000Z', reason: 'Need time' }

  beforeEach(() => {
    jest.clearAllMocks()
    scheduleService.getDeadlineContext.mockResolvedValue({ chapter, series, schedule })
    repo.findOpenByChapter.mockResolvedValue(null)
    repo.create.mockResolvedValue(baseRequest)
    repo.findById.mockResolvedValue(baseRequest)
    stateService.transition.mockResolvedValue(baseRequest)
  })

  // ── create ──
  it('create → 403 when caller is neither mangaka nor editor of the series', async () => {
    await expect(service.create('stranger', createBody)).rejects.toBe(DeadlineRequestAccessDeniedException)
    expect(repo.create).not.toHaveBeenCalled()
  })

  it('create → 409 when chapter is PUBLISHED', async () => {
    scheduleService.getDeadlineContext.mockResolvedValue({
      chapter: { ...chapter, status: ChapterStatus.PUBLISHED },
      series,
      schedule
    })
    await expect(service.create('mangaka-1', createBody)).rejects.toBe(DeadlineRequestNotAllowedException)
    expect(repo.create).not.toHaveBeenCalled()
  })

  it('create → 409 when an open request already exists for the chapter', async () => {
    repo.findOpenByChapter.mockResolvedValue(baseRequest)
    await expect(service.create('mangaka-1', createBody)).rejects.toBe(OpenDeadlineRequestExistsException)
    expect(repo.create).not.toHaveBeenCalled()
  })

  it('create → 404 when chapterId is malformed (OBJECT_ID guard, no DB call)', async () => {
    await expect(service.create('mangaka-1', { ...createBody, chapterId: 'bad' })).rejects.toBe(
      DeadlineRequestNotFoundException
    )
    expect(scheduleService.getDeadlineContext).not.toHaveBeenCalled()
  })

  it('create computes affectsSlot=true for a far requested deadline (> grace window)', async () => {
    await service.create('mangaka-1', { ...createBody, requestedDeadline: '2026-12-01T00:00:00.000Z' })
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ requestedBy: 'MANGAKA', affectsSlot: true }))
  })

  // ── counter ──
  it('counter → 403 NotCounterparty when caller is the side that last proposed', async () => {
    // lastProposedBy = MANGAKA → mangaka cannot counter their own proposal
    await expect(service.counter('mangaka-1', REQUEST_ID, createBody)).rejects.toBe(NotCounterpartyException)
    expect(stateService.transition).not.toHaveBeenCalled()
  })

  it('counter (other side) → COUNTER_PROPOSED with lastProposedBy flipped to caller side', async () => {
    await service.counter('editor-1', REQUEST_ID, createBody)
    expect(stateService.transition).toHaveBeenCalledWith(
      REQUEST_ID,
      DeadlineRequestStatus.COUNTER_PROPOSED,
      expect.objectContaining({ by: 'editor-1', extra: expect.objectContaining({ lastProposedBy: 'EDITOR' }) })
    )
  })

  // ── agree ──
  it('agree (other side) → AGREED_BY_PARTIES', async () => {
    await service.agree('editor-1', REQUEST_ID)
    expect(stateService.transition).toHaveBeenCalledWith(
      REQUEST_ID,
      DeadlineRequestStatus.AGREED_BY_PARTIES,
      expect.objectContaining({ by: 'editor-1' })
    )
  })

  it('agree → 403 NotCounterparty when caller is the proposing side', async () => {
    await expect(service.agree('mangaka-1', REQUEST_ID)).rejects.toBe(NotCounterpartyException)
  })

  // ── reject ──
  it('reject (other side) → ESCALATED', async () => {
    await service.reject('editor-1', REQUEST_ID, { reason: 'no' })
    expect(stateService.transition).toHaveBeenCalledWith(
      REQUEST_ID,
      DeadlineRequestStatus.ESCALATED,
      expect.objectContaining({ by: 'editor-1' })
    )
  })

  // ── withdraw ──
  it('withdraw → 403 when caller is not the initiator', async () => {
    // requestedBy = MANGAKA → editor cannot withdraw
    await expect(service.withdraw('editor-1', REQUEST_ID)).rejects.toBe(DeadlineRequestAccessDeniedException)
    expect(stateService.transition).not.toHaveBeenCalled()
  })

  it('withdraw (initiator) → REJECTED', async () => {
    await service.withdraw('mangaka-1', REQUEST_ID)
    expect(stateService.transition).toHaveBeenCalledWith(
      REQUEST_ID,
      DeadlineRequestStatus.REJECTED,
      expect.objectContaining({ by: 'mangaka-1' })
    )
  })

  it('action → 403 when caller is not a party of the series', async () => {
    await expect(service.agree('stranger', REQUEST_ID)).rejects.toBe(DeadlineRequestAccessDeniedException)
  })

  it('action → 404 when request does not exist', async () => {
    repo.findById.mockResolvedValue(null)
    await expect(service.agree('editor-1', REQUEST_ID)).rejects.toBe(DeadlineRequestNotFoundException)
  })
})
