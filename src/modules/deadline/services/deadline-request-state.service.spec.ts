import { DeadlineRequestStatus } from '@prisma/client'
import { InvalidDeadlineRequestTransitionException, DeadlineRequestNotFoundException } from '../errors/deadline.errors'
import { DeadlineRequestStateService } from './deadline-request-state.service'

describe('DeadlineRequestStateService', () => {
  const repo = { findById: jest.fn(), applyTransition: jest.fn() }
  const service = new DeadlineRequestStateService(repo as never)

  beforeEach(() => jest.clearAllMocks())

  it('applies a valid transition through the repository single writer', async () => {
    repo.findById.mockResolvedValue({ id: 'deadline-1', status: DeadlineRequestStatus.PROPOSED })
    repo.applyTransition.mockResolvedValue({ id: 'deadline-1', status: DeadlineRequestStatus.COUNTER_PROPOSED })

    await service.transition('deadline-1', DeadlineRequestStatus.COUNTER_PROPOSED, {
      by: 'editor-1',
      reason: 'Need another date'
    })

    expect(repo.applyTransition).toHaveBeenCalledWith('deadline-1', {
      from: DeadlineRequestStatus.PROPOSED,
      to: DeadlineRequestStatus.COUNTER_PROPOSED,
      by: 'editor-1',
      reason: 'Need another date',
      extra: undefined
    })
  })

  it('rejects invalid transitions', async () => {
    repo.findById.mockResolvedValue({ id: 'deadline-1', status: DeadlineRequestStatus.PROPOSED })

    await expect(service.transition('deadline-1', DeadlineRequestStatus.APPROVED, { by: 'editor-1' })).rejects.toBe(
      InvalidDeadlineRequestTransitionException
    )
    expect(repo.applyTransition).not.toHaveBeenCalled()
  })

  it('throws not found when the request is missing', async () => {
    repo.findById.mockResolvedValue(null)

    await expect(
      service.transition('deadline-1', DeadlineRequestStatus.COUNTER_PROPOSED, { by: 'editor-1' })
    ).rejects.toBe(DeadlineRequestNotFoundException)
  })
})
