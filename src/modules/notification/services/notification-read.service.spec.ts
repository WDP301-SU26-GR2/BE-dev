import { NotificationReadService } from './notification-read.service'
import { NotificationNotFoundException } from '../errors/notification.errors'
import { NotificationRepository } from '../notification.repo'

const VALID_ID = 'a'.repeat(24)
const baseNotification = {
  id: VALID_ID,
  recipientId: 'u1',
  type: 'DEADLINE',
  referenceId: null,
  referenceType: null,
  content: 'hi',
  isRead: false,
  createdAt: new Date('2026-01-01T00:00:00.000Z')
}

describe('NotificationReadService', () => {
  let repo: {
    findForRecipient: jest.Mock
    countForRecipient: jest.Mock
    countUnread: jest.Mock
    markRead: jest.Mock
    markAllRead: jest.Mock
  }
  let service: NotificationReadService

  beforeEach(() => {
    repo = {
      findForRecipient: jest.fn().mockResolvedValue([baseNotification]),
      countForRecipient: jest.fn().mockResolvedValue(1),
      countUnread: jest.fn().mockResolvedValue(5),
      markRead: jest.fn().mockResolvedValue({ ...baseNotification, isRead: true }),
      markAllRead: jest.fn().mockResolvedValue(3)
    }
    service = new NotificationReadService(repo as unknown as NotificationRepository)
  })

  it('list returns items + total + unreadCount with mapped ISO dates', async () => {
    const result = await service.list('u1', { limit: 20, offset: 0 })

    expect(result.total).toBe(1)
    expect(result.unreadCount).toBe(5)
    expect(result.items[0].createdAt).toBe('2026-01-01T00:00:00.000Z')
    expect(repo.findForRecipient).toHaveBeenCalledWith(
      'u1',
      { isRead: undefined, type: undefined },
      { limit: 20, offset: 0 }
    )
  })

  it('list passes isRead + type filters to repo', async () => {
    await service.list('u1', { isRead: false, type: 'DEADLINE', limit: 10, offset: 0 })

    expect(repo.findForRecipient).toHaveBeenCalledWith(
      'u1',
      { isRead: false, type: 'DEADLINE' },
      { limit: 10, offset: 0 }
    )
  })

  it('markRead returns the mapped record', async () => {
    const result = await service.markRead(VALID_ID, 'u1')

    expect(result.isRead).toBe(true)
  })

  it('markRead throws 404 when repo returns null for not-owner or not-found', async () => {
    repo.markRead.mockResolvedValue(null)

    await expect(service.markRead(VALID_ID, 'u1')).rejects.toBe(NotificationNotFoundException)
  })

  it('markRead throws 404 on malformed id without calling repo', async () => {
    await expect(service.markRead('bad', 'u1')).rejects.toBe(NotificationNotFoundException)
    expect(repo.markRead).not.toHaveBeenCalled()
  })

  it('markAllRead returns updated count', async () => {
    await expect(service.markAllRead('u1')).resolves.toEqual({ updated: 3 })
  })
})
