import { Notification } from '@prisma/client'
import { resolveNotificationTitle } from './notification-title.registry'
import { NotificationResType } from './schemas/notification-schemas'

export function toNotificationRes(notification: Notification): NotificationResType {
  return {
    id: notification.id,
    type: notification.type,
    referenceId: notification.referenceId,
    referenceType: notification.referenceType,
    title: resolveNotificationTitle(notification.referenceType, notification.type),
    content: notification.content,
    isRead: notification.isRead,
    createdAt: notification.createdAt.toISOString()
  }
}
