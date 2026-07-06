import { Injectable } from '@nestjs/common'
import { ManuscriptStatus, NotificationType } from '@prisma/client'
import { DomainEvent } from 'src/core/events/domain-events'
import { DomainEventBus } from 'src/core/events/domain-event-bus.service'
import { NotificationService } from 'src/modules/notification/notification.service'
import {
  ChapterNotFoundException,
  ChapterOnHoldException,
  ContractNotExecutedException,
  NotSeriesEditorException
} from '../errors/chapter.errors'
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
    // PA-04: hold check SAU editor check — người ngoài cuộc nhận 403, không lộ trạng thái hold
    if (chapter.hold) throw ChapterOnHoldException

    // A3 (BR-CONTRACT-05): chặn publish nếu series chưa có Contract FULLY_EXECUTED.
    // Lookup lúc publish (không dùng cờ executedContractId) → luôn đọc trạng thái thật, không staleness.
    const executedContract = await this.chapterRepository.findExecutedContractBySeriesId(series.id)
    if (!executedContract) throw ContractNotExecutedException

    // A-CHP-06 branch: co-owner (PARTIAL_TRANSFER) cần duyệt trước khi publish.
    // coOwnerId chỉ được set bởi B3 (chưa làm) → hiện luôn null → publish thẳng.
    if (series.coOwnerId) {
      const res = await this.manuscriptStateService.transition(chapterId, ManuscriptStatus.AWAITING_CO_OWNER_APPROVAL, {
        changedBy: userId
      })
      await this.notificationService.notifySafe({
        recipientId: series.coOwnerId,
        type: NotificationType.REVIEW,
        referenceId: chapterId,
        referenceType: 'MANUSCRIPT_AWAITING_CO_OWNER',
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
    this.eventBus.emit(DomainEvent.ChapterPublished, {
      chapterId,
      seriesId: series.id,
      chapterNumber: chapter.chapterNumber,
      publishedAt
    })
    return res
  }
}
