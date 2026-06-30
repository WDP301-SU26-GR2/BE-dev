import { DeadlineRequestStatus } from '@prisma/client'
import { DeadlineRequestAccessDeniedException } from '../errors/deadline.errors'
import { DeadlineFinalizeService } from './deadline-finalize.service'

describe('DeadlineFinalizeService', () => {
  const scheduleService = { getDeadlineContext: jest.fn(), extendDeadline: jest.fn() }
  const repo = { findById: jest.fn() }
  const stateService = { transition: jest.fn() }
  const notificationService = { notify: jest.fn() }
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
    expect(notificationService.notify).toHaveBeenCalledWith(expect.objectContaining({ recipientId: 'mangaka-1' }))
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
  })

  it('allows only the assigned editor to finalize', async () => {
    repo.findById.mockResolvedValue(request)
    scheduleService.getDeadlineContext.mockResolvedValue(ctx)

    await expect(service.finalize('mangaka-1', id)).rejects.toBe(DeadlineRequestAccessDeniedException)
    expect(stateService.transition).not.toHaveBeenCalled()
  })
})
