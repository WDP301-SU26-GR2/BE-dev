import { Injectable } from '@nestjs/common'
import { ManuscriptStatus, NotificationType } from '@prisma/client'
import { DomainEvent } from 'src/core/events/domain-events'
import { DomainEventBus } from 'src/core/events/domain-event-bus.service'
import { NotificationService } from 'src/modules/notification/notification.service'
import {
  ChapterNotFoundException,
  ChapterOnHoldException,
  NotSeriesEditorException,
  PagesNotReadyForPublishException
} from '../errors/chapter.errors'
import { ChapterRepository } from '../chapter.repo'
import { assertSeriesContractGate } from './contract-gate.helper'
import { ManuscriptStateService } from './manuscript-state.service'
import { ChapterMessages } from '../chapter.messages'
import { AppConfigService } from 'src/modules/app-config/app-config.service'
import { CacheService } from 'src/infrastructure/redis/cache.service'

@Injectable()
export class ChapterPublishService {
  constructor(
    private readonly chapterRepository: ChapterRepository,
    private readonly manuscriptStateService: ManuscriptStateService,
    private readonly eventBus: DomainEventBus,
    private readonly notificationService: NotificationService,
    private readonly appConfigService: AppConfigService,
    private readonly cacheService: CacheService
  ) {}

  // A-CHP-05/06. Transition map đảm bảo chỉ publish được từ READY_FOR_PRINT (else InvalidManuscriptTransition 409).
  async publish(userId: string, chapterId: string) {
    const chapter = await this.chapterRepository.findChapterById(chapterId)
    if (!chapter) throw ChapterNotFoundException
    const series = await this.chapterRepository.findSeriesById(chapter.seriesId)
    if (!series || series.editorId !== userId) throw NotSeriesEditorException
    // PA-04: hold check SAU editor check — người ngoài cuộc nhận 403, không lộ trạng thái hold
    if (chapter.hold) throw ChapterOnHoldException

    // Task A (siết displayFile khi xuất bản): khi manuscript ĐÃ READY_FOR_PRINT mà vẫn còn page chưa
    // COMPLETED (page DRAFT thêm sau lúc submit → lọt vào chương, không qua duyệt Editor), chặn publish —
    // nếu không độc giả đọc `compositeFile ?? originalFile` của page đó = bản chưa duyệt.
    // Chỉ gate khi manuscript READY_FOR_PRINT: nếu manuscript chưa ready thì để transition báo đúng
    // InvalidManuscriptTransition (đừng "cướp" lỗi của bước sau). Áp cả nhánh co-owner (cùng nguồn READY_FOR_PRINT).
    const manuscript = await this.chapterRepository.findManuscriptByChapterId(chapterId)
    if (manuscript?.status === ManuscriptStatus.READY_FOR_PRINT) {
      const notCompleted = await this.chapterRepository.countPagesNotCompleted(chapterId)
      if (notCompleted > 0) throw PagesNotReadyForPublishException
    }

    // A3 (BR-CONTRACT-05): ending phase được NỚI sang nhánh "đã từng có hợp đồng hiệu lực", KHÔNG bỏ kiểm.
    // Bỏ kiểm (hành vi cũ) khiến bộ truyện CHƯA TỪNG ký vẫn xuất bản được — và COMPLETING lại không có trần
    // số chương nên xuất bản được không giới hạn. Luật dùng chung với `POST /chapters` (contract-gate.helper).
    await assertSeriesContractGate(this.chapterRepository, series)

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
    await this.cacheService.bumpVersion('pubseries')
    return res
  }
}
