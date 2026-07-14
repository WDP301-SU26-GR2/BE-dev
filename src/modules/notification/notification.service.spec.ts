import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'
import { buildDedupeKey, NotificationService } from './notification.service'

function makeService(overrides: { create?: jest.Mock; existing?: unknown } = {}) {
  const repo = {
    create: overrides.create ?? jest.fn().mockImplementation((data) => Promise.resolve({ id: 'new', ...data })),
    findByDedupeKey: jest.fn().mockResolvedValue(overrides.existing ?? null)
  }
  return { service: new NotificationService(repo as never), repo }
}

function uniqueConstraintError() {
  return new PrismaClientKnownRequestError('duplicate dedupe key', { code: 'P2002', clientVersion: '6.19.0' })
}

describe('buildDedupeKey', () => {
  it('returns the same key for the same payload', () => {
    const input = {
      recipientId: 'u1',
      type: 'TASK' as const,
      referenceId: 'task1',
      referenceType: 'TASK_ASSIGNED',
      content: 'assigned'
    }

    expect(buildDedupeKey(input)).toBe('u1|TASK|task1|TASK_ASSIGNED|c4407719eccaafa9')
    expect(buildDedupeKey({ ...input })).toBe(buildDedupeKey(input))
  })

  it('returns different keys when content differs', () => {
    const input = {
      recipientId: 'u1',
      type: 'TASK' as const,
      referenceId: 'task1',
      referenceType: 'TASK_ASSIGNED'
    }

    expect(buildDedupeKey({ ...input, content: 'round one' })).not.toBe(
      buildDedupeKey({ ...input, content: 'round two' })
    )
  })

  it('normalizes missing refs and content in the key', () => {
    expect(buildDedupeKey({ recipientId: 'u1', type: 'SYSTEM' })).toBe('u1|SYSTEM|||da39a3ee5e6b4b0d')
    expect(
      buildDedupeKey({ recipientId: 'u1', type: 'SYSTEM', referenceId: null, referenceType: null, content: null })
    ).toBe('u1|SYSTEM|||da39a3ee5e6b4b0d')
  })
})

describe('NotificationService.notify', () => {
  it('creates once with a dedupe key and null-normalized optional fields', async () => {
    const { service, repo } = makeService()

    const result = await service.notify({ recipientId: 'u1', type: 'SYSTEM' })

    expect(repo.create).toHaveBeenCalledTimes(1)
    expect(repo.create).toHaveBeenCalledWith({
      recipientId: 'u1',
      type: 'SYSTEM',
      referenceId: null,
      referenceType: null,
      content: null,
      dedupeKey: 'u1|SYSTEM|||da39a3ee5e6b4b0d'
    })
    expect(repo.findByDedupeKey).not.toHaveBeenCalled()
    expect(result).toMatchObject({ id: 'new', recipientId: 'u1' })
  })

  it('returns the existing notification after a P2002 create conflict', async () => {
    const existing = { id: 'existing', recipientId: 'u1', type: 'TASK' }
    const { service, repo } = makeService({ create: jest.fn().mockRejectedValue(uniqueConstraintError()), existing })
    const input = {
      recipientId: 'u1',
      type: 'TASK' as const,
      referenceId: 'task1',
      referenceType: 'TASK_ASSIGNED',
      content: 'assigned'
    }

    await expect(service.notify(input)).resolves.toBe(existing)
    expect(repo.create).toHaveBeenCalledTimes(1)
    expect(repo.findByDedupeKey).toHaveBeenCalledWith('u1|TASK|task1|TASK_ASSIGNED|c4407719eccaafa9')
  })

  it('rethrows non-P2002 create errors', async () => {
    const original = new Error('database unavailable')
    const { service, repo } = makeService({ create: jest.fn().mockRejectedValue(original) })

    await expect(service.notify({ recipientId: 'u1', type: 'SYSTEM' })).rejects.toBe(original)
    expect(repo.findByDedupeKey).not.toHaveBeenCalled()
  })

  it('rethrows the original P2002 error when no existing notification is found', async () => {
    const original = uniqueConstraintError()
    const { service, repo } = makeService({ create: jest.fn().mockRejectedValue(original) })

    await expect(service.notify({ recipientId: 'u1', type: 'SYSTEM' })).rejects.toBe(original)
    expect(repo.findByDedupeKey).toHaveBeenCalledWith('u1|SYSTEM|||da39a3ee5e6b4b0d')
  })
})

describe('NotificationService.notifySafe', () => {
  it('swallows notify errors', async () => {
    const { service } = makeService({ create: jest.fn().mockRejectedValue(new Error('database unavailable')) })

    await expect(service.notifySafe({ recipientId: 'u1', type: 'SYSTEM' })).resolves.toBeUndefined()
  })
})
