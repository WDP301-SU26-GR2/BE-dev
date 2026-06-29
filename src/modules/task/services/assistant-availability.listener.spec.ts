import { AssistantAvailabilityListener } from './assistant-availability.listener'

describe('AssistantAvailabilityListener', () => {
  const repo = { findTasksByAssistantInStatuses: jest.fn() }
  const taskState = { transition: jest.fn() }
  const listener = new AssistantAvailabilityListener(repo as never, taskState as never)
  beforeEach(() => jest.clearAllMocks())

  it('holds ASSIGNED/IN_PROGRESS/REVISION_REQUESTED tasks on ON_LEAVE', async () => {
    repo.findTasksByAssistantInStatuses.mockResolvedValue([{ id: 't1' }, { id: 't2' }])
    await listener.handle({ assistantId: 'a', availabilityStatus: 'ON_LEAVE' })
    expect(repo.findTasksByAssistantInStatuses).toHaveBeenCalledWith('a', [
      'ASSIGNED',
      'IN_PROGRESS',
      'REVISION_REQUESTED'
    ])
    expect(taskState.transition).toHaveBeenCalledWith('t1', 'ON_HOLD')
    expect(taskState.transition).toHaveBeenCalledWith('t2', 'ON_HOLD')
  })

  it('ignores non-leave status', async () => {
    await listener.handle({ assistantId: 'a', availabilityStatus: 'AVAILABLE' })
    expect(repo.findTasksByAssistantInStatuses).not.toHaveBeenCalled()
  })
})
