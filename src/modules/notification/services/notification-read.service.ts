import { Injectable } from '@nestjs/common'
import { NotificationNotFoundException } from '../errors/notification.errors'
import { toNotificationRes } from '../notification.mapper'
import { NotificationRepository } from '../notification.repo'
import { ListNotificationsQueryType } from '../schemas/notification-schemas'

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/

@Injectable()
export class NotificationReadService {
  constructor(private readonly notificationRepository: NotificationRepository) {}

  async list(recipientId: string, query: ListNotificationsQueryType) {
    const filter = { isRead: query.isRead, type: query.type }
    const page = { limit: query.limit, offset: query.offset }
    const [items, total, unreadCount] = await Promise.all([
      this.notificationRepository.findForRecipient(recipientId, filter, page),
      this.notificationRepository.countForRecipient(recipientId, filter),
      this.notificationRepository.countUnread(recipientId)
    ])

    return {
      items: items.map(toNotificationRes),
      total,
      unreadCount,
      limit: query.limit,
      offset: query.offset
    }
  }

  async markRead(id: string, recipientId: string) {
    if (!OBJECT_ID_RE.test(id)) throw NotificationNotFoundException
    const notification = await this.notificationRepository.markRead(id, recipientId)
    if (!notification) throw NotificationNotFoundException
    return toNotificationRes(notification)
  }

  async markAllRead(recipientId: string) {
    const updated = await this.notificationRepository.markAllRead(recipientId)
    return { updated }
  }
}
