import { Injectable } from '@nestjs/common'
import { ManuscriptStatus, NotificationType, SeriesStatus } from '@prisma/client'
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
import { AppConfigService } from 'src/modules/app-config/app-config.service'

@Injectable()
export class ChapterPublishService {
  constructor(
    private readonly chapterRepository: ChapterRepository,
    private readonly manuscriptStateService: ManuscriptStateService,
    private readonly eventBus: DomainEventBus,
    private readonly notificationService: NotificationService,
    private readonly appConfigService: AppConfigService
  ) {}

  // A-CHP-05/06. Transition map đảm bảo chỉ publish được từ READY_FOR_PRINT (else InvalidManuscriptTransition 409).
  async publish(userId: string, chapterId: string) {
    const chapter = await this.chapterRepository.findChapterById(chapterId)
    if (!chapter) throw ChapterNotFoundException
    const series = await this.chapterRepository.findSeriesById(chapter.seriesId)
    if (!series || series.editorId !== userId) throw NotSeriesEditorException
    // PA-04: hold check SAU editor check — người ngoài cuộc nhận 403, không lộ trạng thái hold
    if (chapter.hold) throw ChapterOnHoldException

    // A3 (BR-CONTRACT-05): gate chỉ áp khi CHƯA vào ending phase (Fix-1 G-1).
    // CANCELLING/COMPLETING: contract đã bị B-CON-09 terminate ngay lúc cancel — ending chapters
    // vẫn phải publish được (Requiment Flow 5: Mangaka vẽ 3-5 chương kết thúc; tiền đã tất toán).
    const ENDING_STATUSES: SeriesStatus[] = [SeriesStatus.CANCELLING, SeriesStatus.COMPLETING]
    if (!ENDING_STATUSES.includes(series.status)) {
      const executedContract = await this.chapterRepository.findExecutedContractBySeriesId(series.id)
      if (!executedContract) throw ContractNotExecutedException
    }

    // A-CHP-06 branch: co-owner (PARTIAL_TRANSFER) cần duyệt trước khi publish.
    // coOwnerId do B3 (transfer PARTIAL_TRANSFER) set. Tạo record ChapterCoOwnerApproval + notify.
    // Duyệt/từ chối qua ChapterCoOwnerService; escalate quá hạn qua CoOwnerEscalationCron.
    if (series.coOwnerId) {
      const res = await this.manuscriptStateService.transition(chapterId, ManuscriptStatus.AWAITING_CO_OWNER_APPROVAL, {
        changedBy: userId
      })
      const appConfig = await this.appConfigService.get()
      const deadline = new Date(Date.now() + appConfig.coOwnerApprovalGraceDays * 86400_000)
      await this.chapterRepository.createCoOwnerApproval({ chapterId, coOwnerId: series.coOwnerId, deadline })
      await this.notificationService.notifySafe({
        recipientId: series.coOwnerId,
        type: NotificationType.REVIEW,
        referenceId: chapterId,
        referenceType: 'MANUSCRIPT_AWAITING_CO_OWNER',
        content: ChapterMessages.notification.awaitingCoOwnerApproval
      })
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
