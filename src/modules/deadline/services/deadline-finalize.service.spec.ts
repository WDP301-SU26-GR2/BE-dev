import { DeadlineRequestStatus } from '@prisma/client'
import {
  DeadlineNotAwaitingBoardException,
  DeadlineRequestAccessDeniedException,
  DeadlineRequestNotFoundException
} from '../errors/deadline.errors'
import { DeadlineFinalizeService } from './deadline-finalize.service'

describe('DeadlineFinalizeService', () => {
  const scheduleService = { getDeadlineContext: jest.fn(), extendDeadline: jest.fn() }
  const repo = { findById: jest.fn() }
  const stateService = { transition: jest.fn() }
  const notificationService = { notifySafe: jest.fn().mockResolvedValue(undefined) }
  const service = new DeadlineFinalizeService(
    scheduleService as never,
    repo as never,
    stateService as never,
    notificationService as never
  )

  const id = '507f1f77bcf86cd799439011'
  const request = {
    id,
    scheduleId: '507f1f77bcf86cd799439013',
    chapterId: '507f1f77bcf86cd799439012',
    seriesId: '507f1f77bcf86cd799439014',
    requestedBy: 'MANGAKA',
    lastProposedBy: 'MANGAKA',
    currentDeadline: new Date('2026-07-01T00:00:00.000Z'),
    requestedDeadline: new Date('2026-07-02T00:00:00.000Z'),
    reason: 'Need polishing',
    affectsSlot: false,
    status: DeadlineRequestStatus.AGREED_BY_PARTIES,
    boardReviewedBy: null,
    resolvedAt: null,
    createdAt: new Date('2026-06-30T00:00:00.000Z')
  }
  const ctx = {
    series: { mangakaId: 'mangaka-1', editorId: 'editor-1' },
    schedule: { currentDeadline: new Date('2026-07-01T00:00:00.000Z') }
  }

  beforeEach(() => jest.clearAllMocks())

  it('approves and extends schedule when the negotiated date stays within slot grace', async () => {
    repo.findById.mockResolvedValue(request)
    scheduleService.getDeadlineContext.mockResolvedValue(ctx)
    stateService.transition.mockResolvedValue({
      ...request,
      status: DeadlineRequestStatus.APPROVED,
      affectsSlot: false
    })

    const result = await service.finalize('editor-1', id)

    expect(stateService.transition).toHaveBeenCalledWith(id, DeadlineRequestStatus.APPROVED, {
      by: 'editor-1',
      extra: { affectsSlot: false }
    })
    expect(scheduleService.extendDeadline).toHaveBeenCalledWith('editor-1', request.chapterId, {
      newDeadline: request.requestedDeadline.toISOString(),
      reason: request.reason
    })
    expect(notificationService.notifySafe).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: 'mangaka-1', referenceType: 'DEADLINE_APPROVED' })
    )
    expect(result.status).toBe(DeadlineRequestStatus.APPROVED)
  })

  it('routes to board review without extending schedule when slot is affected', async () => {
    repo.findById.mockResolvedValue({
      ...request,
      requestedDeadline: new Date('2026-07-05T00:00:01.000Z')
    })
    scheduleService.getDeadlineContext.mockResolvedValue(ctx)
    stateService.transition.mockResolvedValue({
      ...request,
      status: DeadlineRequestStatus.BOARD_REVIEW,
      affectsSlot: true
    })

    await service.finalize('editor-1', id)

    expect(stateService.transition).toHaveBeenCalledWith(id, DeadlineRequestStatus.BOARD_REVIEW, {
      by: 'editor-1',
      extra: { affectsSlot: true }
    })
    expect(scheduleService.extendDeadline).not.toHaveBeenCalled()
    expect(notificationService.notifySafe).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: 'mangaka-1', referenceType: 'DEADLINE_BOARD_REVIEW' })
    )
  })

  it('allows only the assigned editor to finalize', async () => {
    repo.findById.mockResolvedValue(request)
    scheduleService.getDeadlineContext.mockResolvedValue(ctx)

    await expect(service.finalize('mangaka-1', id)).rejects.toBe(DeadlineRequestAccessDeniedException)
    expect(stateService.transition).not.toHaveBeenCalled()
  })
})

describe('DeadlineFinalizeService.boardResolve (A-DL-03)', () => {
  const scheduleService = { getDeadlineContext: jest.fn(), extendDeadline: jest.fn(), extendDeadlineByBoard: jest.fn() }
  const repo = { findById: jest.fn() }
  const stateService = { transition: jest.fn() }
  const notificationService = { notifySafe: jest.fn().mockResolvedValue(undefined) }
  const service = new DeadlineFinalizeService(
    scheduleService as never,
    repo as never,
    stateService as never,
    notificationService as never
  )

  const id = '507f1f77bcf86cd799439031'
  type MockRequest = {
    id: string
    chapterId: string
    seriesId: string
    requestedBy: string
    lastProposedBy: string
    currentDeadline: Date
    requestedDeadline: Date
    reason: string | null
    affectsSlot: boolean
    status: DeadlineRequestStatus
    boardReviewedBy: string | null
    resolvedAt: Date | null
    createdAt: Date
  }
  const baseRequest: MockRequest = {
    id,
    chapterId: '507f1f77bcf86cd799439032',
    seriesId: '507f1f77bcf86cd799439033',
    requestedBy: 'MANGAKA',
    lastProposedBy: 'MANGAKA',
    currentDeadline: new Date('2026-08-01T00:00:00.000Z'),
    requestedDeadline: new Date('2026-08-10T00:00:00.000Z'),
    reason: 'Need more time',
    affectsSlot: true,
    status: DeadlineRequestStatus.BOARD_REVIEW,
    boardReviewedBy: null,
    resolvedAt: null,
    createdAt: new Date('2026-07-30T00:00:00.000Z')
  }
  const ctx = {
    chapter: { id: '507f1f77bcf86cd799439032' },
    series: { mangakaId: 'mangaka-1', editorId: 'editor-1' },
    schedule: { currentDeadline: new Date('2026-08-01T00:00:00.000Z') }
  }

  beforeEach(() => jest.clearAllMocks())

  function prepareMocks(overrides: Partial<MockRequest> = {}) {
    const request: MockRequest = { ...baseRequest, ...overrides }
    repo.findById.mockResolvedValue(request)
    scheduleService.getDeadlineContext.mockResolvedValue(ctx)
    return request
  }

  it('APPROVE from BOARD_REVIEW → APPROVED + updates Schedule + notifies mangaka & editor', async () => {
    const request = prepareMocks()
    stateService.transition.mockResolvedValue({ ...request, status: DeadlineRequestStatus.APPROVED })

    const result = await service.boardResolve('board-1', id, { decision: 'APPROVE' })

    expect(stateService.transition).toHaveBeenCalledWith(id, DeadlineRequestStatus.APPROVED, {
      by: 'board-1',
      extra: { boardReviewedBy: 'board-1' }
    })
    expect(scheduleService.extendDeadlineByBoard).toHaveBeenCalledWith(
      'board-1',
      request.chapterId,
      request.requestedDeadline,
      request.reason
    )
    expect(scheduleService.extendDeadline).not.toHaveBeenCalled()
    expect(notificationService.notifySafe).toHaveBeenCalledTimes(2)
    expect(notificationService.notifySafe).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: 'mangaka-1', referenceType: 'DEADLINE_BOARD_APPROVED' })
    )
    expect(notificationService.notifySafe).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: 'editor-1', referenceType: 'DEADLINE_BOARD_APPROVED' })
    )
    expect(result.status).toBe(DeadlineRequestStatus.APPROVED)
  })

  it('APPROVE from ESCALATED → APPROVED + updates Schedule', async () => {
    const request = prepareMocks({ status: DeadlineRequestStatus.ESCALATED, reason: null })
    stateService.transition.mockResolvedValue({ ...request, status: DeadlineRequestStatus.APPROVED })

    await service.boardResolve('board-1', id, { decision: 'APPROVE' })

    expect(stateService.transition).toHaveBeenCalledWith(id, DeadlineRequestStatus.APPROVED, {
      by: 'board-1',
      extra: { boardReviewedBy: 'board-1' }
    })
    expect(scheduleService.extendDeadlineByBoard).toHaveBeenCalledWith(
      'board-1',
      request.chapterId,
      request.requestedDeadline,
      'Deadline resolved by Board (A5)'
    )
  })

  it('REJECT → REJECTED, Schedule NOT updated', async () => {
    const request = prepareMocks()
    stateService.transition.mockResolvedValue({ ...request, status: DeadlineRequestStatus.REJECTED })

    await service.boardResolve('board-1', id, { decision: 'REJECT', note: 'slot conflict' })

    expect(stateService.transition).toHaveBeenCalledWith(id, DeadlineRequestStatus.REJECTED, {
      by: 'board-1',
      extra: { boardReviewedBy: 'board-1' }
    })
    expect(scheduleService.extendDeadlineByBoard).not.toHaveBeenCalled()
    expect(notificationService.notifySafe).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: 'mangaka-1', referenceType: 'DEADLINE_BOARD_REJECTED' })
    )
  })

  it('409 when request is not in BOARD_REVIEW/ESCALATED', async () => {
    prepareMocks({ status: DeadlineRequestStatus.AGREED_BY_PARTIES })

    await expect(service.boardResolve('board-1', id, { decision: 'APPROVE' })).rejects.toBe(
      DeadlineNotAwaitingBoardException
    )
    expect(stateService.transition).not.toHaveBeenCalled()
    expect(scheduleService.extendDeadlineByBoard).not.toHaveBeenCalled()
  })

  it('404 on malformed id', async () => {
    await expect(service.boardResolve('board-1', 'garbage', { decision: 'APPROVE' })).rejects.toBe(
      DeadlineRequestNotFoundException
    )
    expect(repo.findById).not.toHaveBeenCalled()
  })
})
