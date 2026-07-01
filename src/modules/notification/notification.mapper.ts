import { Notification } from '@prisma/client'
import { NotificationResType } from './schemas/notification-schemas'

export function toNotificationRes(notification: Notification): NotificationResType {
  return {
    id: notification.id,
    type: notification.type,
    referenceId: notification.referenceId,
    referenceType: notification.referenceType,
    content: notification.content,
    isRead: notification.isRead,
    createdAt: notification.createdAt.toISOString()
  }
}
