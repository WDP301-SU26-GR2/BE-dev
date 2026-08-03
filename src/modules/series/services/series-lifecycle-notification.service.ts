import { Injectable } from '@nestjs/common'
import { NotificationType } from '@prisma/client'
import { NotificationService } from 'src/modules/notification/notification.service'
import { SeriesRepository } from '../series.repo'

@Injectable()
export class SeriesLifecycleNotificationService {
  constructor(
    private readonly notifications: NotificationService,
    private readonly seriesRepository: SeriesRepository
  ) {}

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

  // Spec 30 / Requiment §1.10: khi studio dừng/tiếp tục, trợ lý đang giữ việc dở cũng phải biết.
  async notifyOwnersAndAssistants(
    series: { mangakaId?: string | null; editorId?: string | null },
    referenceType: string,
    content: string,
    seriesId: string
  ) {
    await this.notifyOwners(series, referenceType, content, seriesId)
    const assistantIds = await this.seriesRepository.findActiveAssistantIdsBySeries(seriesId)
    await Promise.all(assistantIds.map((recipientId) => this.notifyOne(recipientId, seriesId, referenceType, content)))
  }
}
