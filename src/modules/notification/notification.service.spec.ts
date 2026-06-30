import { NotificationService } from './notification.service'

function makeService(overrides: { existing?: unknown }) {
  const repo = {
    findDuplicate: jest.fn().mockResolvedValue(overrides.existing ?? null),
    create: jest.fn().mockImplementation((d) => Promise.resolve({ id: 'new', ...d }))
  }
  return { service: new NotificationService(repo as never), repo }
}

describe('NotificationService.notify', () => {
  it('creates a notification when no duplicate exists', async () => {
    const { service, repo } = makeService({})
    const res = await service.notify({
      recipientId: 'u1',
      type: 'TASK',
      referenceId: 'task1',
      referenceType: 'TASK',
      content: 'assigned'
    })
    expect(repo.create).toHaveBeenCalledWith({
      recipientId: 'u1',
      type: 'TASK',
      referenceId: 'task1',
      referenceType: 'TASK',
      content: 'assigned'
    })
    expect(res).toMatchObject({ id: 'new', recipientId: 'u1' })
  })

  it('is idempotent: returns existing and does not create a duplicate', async () => {
    const existing = { id: 'old', recipientId: 'u1', type: 'TASK' }
    const { service, repo } = makeService({ existing })
    const res = await service.notify({ recipientId: 'u1', type: 'TASK', referenceId: 'task1', referenceType: 'TASK' })
    expect(res).toBe(existing)
    expect(repo.create).not.toHaveBeenCalled()
  })

  it('normalizes missing refs/content to null in the dedupe key', async () => {
    const { service, repo } = makeService({})
    await service.notify({ recipientId: 'u1', type: 'SYSTEM' })
    expect(repo.findDuplicate).toHaveBeenCalledWith({
      recipientId: 'u1',
      type: 'SYSTEM',
      referenceId: null,
      referenceType: null
    })
    expect(repo.create).toHaveBeenCalledWith({
      recipientId: 'u1',
      type: 'SYSTEM',
      referenceId: null,
      referenceType: null,
      content: null
    })
  })
})

describe('NotificationService.notifySafe', () => {
  it('delegates to notify on success', async () => {
    const { service, repo } = makeService({})

    await service.notifySafe({
      recipientId: 'u1',
      type: 'TASK',
      referenceId: 'task1',
      referenceType: 'TASK_ASSIGNED',
      content: 'assigned'
    })

    expect(repo.create).toHaveBeenCalledWith({
      recipientId: 'u1',
      type: 'TASK',
      referenceId: 'task1',
      referenceType: 'TASK_ASSIGNED',
      content: 'assigned'
    })
  })

  it('swallows notify errors and does not rethrow', async () => {
    const repo = { findDuplicate: jest.fn().mockRejectedValue(new Error('db down')), create: jest.fn() }
    const service = new NotificationService(repo as never)

    await expect(
      service.notifySafe({
        recipientId: 'u1',
        type: 'TASK',
        referenceId: 'task1',
        referenceType: 'TASK_ASSIGNED',
        content: 'assigned'
      })
    ).resolves.toBeUndefined()
    expect(repo.create).not.toHaveBeenCalled()
  })
})
