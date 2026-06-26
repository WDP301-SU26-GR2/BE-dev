import { Injectable } from '@nestjs/common'
import { ManuscriptStatus, NotificationType } from '@prisma/client'
import { DomainEvent } from 'src/core/events/domain-events'
import { DomainEventBus } from 'src/core/events/domain-event-bus.service'
import { NotificationService } from 'src/modules/notification/notification.service'
import { ChapterNotFoundException, NotSeriesEditorException } from '../errors/chapter.errors'
import { ChapterRepository } from '../chapter.repo'
import { ManuscriptStateService } from './manuscript-state.service'
import { ChapterMessages } from '../chapter.messages'

@Injectable()
export class ChapterPublishService {
  constructor(
    private readonly chapterRepository: ChapterRepository,
    private readonly manuscriptStateService: ManuscriptStateService,
    private readonly eventBus: DomainEventBus,
    private readonly notificationService: NotificationService
  ) {}

  // A-CHP-05/06. Transition map đảm bảo chỉ publish được từ READY_FOR_PRINT (else InvalidManuscriptTransition 409).
  async publish(userId: string, chapterId: string) {
    const chapter = await this.chapterRepository.findChapterById(chapterId)
    if (!chapter) throw ChapterNotFoundException
    const series = await this.chapterRepository.findSeriesById(chapter.seriesId)
    if (!series || series.editorId !== userId) throw NotSeriesEditorException

    // B1-INTEGRATION: chặn publish nếu series chưa có Contract FULLY_EXECUTED (BR-CONTRACT-05).
    // Defer — khi B1 xong: if (!contractExecuted) throw ContractNotExecutedException

    // A-CHP-06 branch: co-owner (PARTIAL_TRANSFER) cần duyệt trước khi publish.
    // coOwnerId chỉ được set bởi B3 (chưa làm) → hiện luôn null → publish thẳng.
    if (series.coOwnerId) {
      const res = await this.manuscriptStateService.transition(chapterId, ManuscriptStatus.AWAITING_CO_OWNER_APPROVAL, {
        changedBy: userId
      })
      await this.notificationService.notify({
        recipientId: series.coOwnerId,
        type: NotificationType.REVIEW,
        referenceId: chapterId,
        referenceType: 'CHAPTER',
        content: ChapterMessages.notification.awaitingCoOwnerApproval
      })
      // B3-INTEGRATION: endpoint co-owner approve/reject + B5-INTEGRATION escalate quá hạn (defer).
      return res
    }

    const res = await this.manuscriptStateService.transition(chapterId, ManuscriptStatus.PUBLISHED, {
      changedBy: userId
    })
    // Emit SAU khi DB cập nhật (spec §6.1). publishedAt lấy từ chapter sau transition.
    const publishedAt = res?.publishedAt ? res.publishedAt.toISOString() : new Date().toISOString()
    this.eventBus.emit(DomainEvent.ChapterPublished, { chapterId, seriesId: series.id, publishedAt })
    await this.notificationService.notify({
      recipientId: series.mangakaId,
      type: NotificationType.REVIEW,
      referenceId: chapterId,
      referenceType: 'CHAPTER',
      content: ChapterMessages.notification.chapterPublished
    })
    return res
  }
}
