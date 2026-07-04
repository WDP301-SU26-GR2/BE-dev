import { TaskStateService } from './task-state.service'
import { InvalidTaskTransitionException, TaskNotFoundException } from '../errors/task.errors'

describe('TaskStateService', () => {
  const repo = { findTaskById: jest.fn(), updateTaskStatus: jest.fn() }
  const service = new TaskStateService(repo as never)
  beforeEach(() => jest.clearAllMocks())

  it('allows ASSIGNED → IN_PROGRESS', async () => {
    repo.findTaskById.mockResolvedValue({ id: 't', status: 'ASSIGNED' })
    repo.updateTaskStatus.mockResolvedValue({ id: 't', status: 'IN_PROGRESS' })
    await service.transition('t', 'IN_PROGRESS')
    expect(repo.updateTaskStatus).toHaveBeenCalledWith('t', 'IN_PROGRESS', undefined)
  })

  it('allows IN_PROGRESS to ASSIGNED for reassign and to CANCELLED with reason', async () => {
    repo.findTaskById.mockResolvedValue({ id: 't', status: 'IN_PROGRESS' })
    repo.updateTaskStatus.mockResolvedValue({ id: 't', status: 'ASSIGNED' })
    await service.transition('t', 'ASSIGNED')
    expect(repo.updateTaskStatus).toHaveBeenCalledWith('t', 'ASSIGNED', undefined)

    repo.updateTaskStatus.mockResolvedValue({ id: 't', status: 'CANCELLED' })
    await service.transition('t', 'CANCELLED', 'Region deleted')
    expect(repo.updateTaskStatus).toHaveBeenCalledWith('t', 'CANCELLED', 'Region deleted')
  })

  it('rejects transition out of CANCELLED because it is terminal', async () => {
    repo.findTaskById.mockResolvedValue({ id: 't', status: 'CANCELLED' })
    await expect(service.transition('t', 'ASSIGNED')).rejects.toBe(InvalidTaskTransitionException)
    expect(repo.updateTaskStatus).not.toHaveBeenCalled()
  })

  it('rejects ASSIGNED → APPROVED (409)', async () => {
    repo.findTaskById.mockResolvedValue({ id: 't', status: 'ASSIGNED' })
    await expect(service.transition('t', 'APPROVED')).rejects.toBe(InvalidTaskTransitionException)
    expect(repo.updateTaskStatus).not.toHaveBeenCalled()
  })

  it('throws TaskNotFound when missing', async () => {
    repo.findTaskById.mockResolvedValue(null)
    await expect(service.transition('t', 'IN_PROGRESS')).rejects.toBe(TaskNotFoundException)
  })
})
