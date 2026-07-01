import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { NotificationType } from '@prisma/client'
import { DomainEvent, DomainEventPayload } from 'src/core/events/domain-events'
import { NotificationQueue } from 'src/modules/notification/notification.queue'
import { ChapterMessages } from '../chapter.messages'
import { ChapterRepository } from '../chapter.repo'

@Injectable()
export class ChapterPublishedListener {
  constructor(
    private readonly chapterRepository: ChapterRepository,
    private readonly notificationQueue: NotificationQueue
  ) {}

  @OnEvent(DomainEvent.ChapterPublished)
  async handle(payload: DomainEventPayload[typeof DomainEvent.ChapterPublished]): Promise<void> {
    const recipients = await this.chapterRepository.findSeriesRecipients(payload.seriesId)
    if (!recipients) return

    const targets = [recipients.mangakaId, recipients.editorId].filter((id): id is string => typeof id === 'string')
    for (const recipientId of targets) {
      await this.notificationQueue.enqueue({
        recipientId,
        type: NotificationType.SYSTEM,
        referenceId: payload.chapterId,
        referenceType: 'CHAPTER_PUBLISHED',
        content: ChapterMessages.notification.chapterPublished
      })
    }
  }
}
