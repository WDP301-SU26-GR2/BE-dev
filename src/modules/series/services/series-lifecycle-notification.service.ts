import { Injectable } from '@nestjs/common'
import { NotificationType } from '@prisma/client'
import { NotificationService } from 'src/modules/notification/notification.service'

@Injectable()
export class SeriesLifecycleNotificationService {
  constructor(private readonly notifications: NotificationService) {}

  notifyOne(recipientId: string, seriesId: string, referenceType: string, content: string) {
    return this.notifications.notifySafe({
      recipientId,
      type: NotificationType.SYSTEM,
      referenceId: seriesId,
      referenceType,
      content
    })
  }

  async notifyOwners(
    series: { mangakaId?: string | null; editorId?: string | null },
    referenceType: string,
    content: string,
    seriesId: string
  ) {
    await Promise.all(
      [series.mangakaId, series.editorId]
        .filter((id): id is string => !!id)
        .map((recipientId) => this.notifyOne(recipientId, seriesId, referenceType, content))
    )
  }
}
