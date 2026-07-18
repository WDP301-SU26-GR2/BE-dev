import { Injectable } from '@nestjs/common'
import { CoOwnerApprovalStatus, ManuscriptStatus, NotificationType, PageStatus } from '@prisma/client'
import { DomainEvent } from 'src/core/events/domain-events'
import { DomainEventBus } from 'src/core/events/domain-event-bus.service'
import { NotificationService } from 'src/modules/notification/notification.service'
import { ChapterRepository } from '../chapter.repo'
import { ChapterMessages } from '../chapter.messages'
import {
  ChapterNotFoundException,
  CoOwnerApprovalNotFoundException,
  CoOwnerApprovalNotPendingException,
  NotCoOwnerException
} from '../errors/chapter.errors'
import { ManuscriptStateService } from './manuscript-state.service'

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/

// A-CHP-06 / B-TRF-05: co-owner (PARTIAL_TRANSFER) duyệt chapter đang AWAITING_CO_OWNER_APPROVAL.
// Seam gộp về chapter (BE-A) vì Manuscript là single-writer ở đây. Transfer chỉ set Series.coOwnerId.
@Injectable()
export class ChapterCoOwnerService {
  constructor(
    private readonly chapterRepository: ChapterRepository,
    private readonly manuscriptStateService: ManuscriptStateService,
    private readonly eventBus: DomainEventBus,
    private readonly notificationService: NotificationService
  ) {}

  async approve(userId: string, chapterId: string) {
    const { chapter, series, approval } = await this.loadPending(userId, chapterId)

    await this.chapterRepository.updateCoOwnerApproval(approval.id, {
      status: CoOwnerApprovalStatus.APPROVED,
      decisionAt: new Date()
    })
    const res = await this.manuscriptStateService.transition(chapterId, ManuscriptStatus.PUBLISHED, {
      changedBy: userId
    })

    const publishedAt = res?.publishedAt ? res.publishedAt.toISOString() : new Date().toISOString()
    this.eventBus.emit(DomainEvent.ChapterPublished, {
      chapterId,
      seriesId: series.id,
      chapterNumber: chapter.chapterNumber,
      publishedAt
    })
    await this.notifyOwners(series, chapterId, ChapterMessages.notification.coOwnerApproved, 'CHAPTER_COOWNER_APPROVED')
    return res
  }

  async reject(userId: string, chapterId: string, reason: string) {
    const { series, approval } = await this.loadPending(userId, chapterId)

    await this.manuscriptStateService.assertCanTransition(chapterId, ManuscriptStatus.EDITOR_REVISION)

    await this.chapterRepository.updateCoOwnerApproval(approval.id, {
      status: CoOwnerApprovalStatus.REJECTED,
      decisionAt: new Date(),
      rejectReason: reason
    })
    const res = await this.manuscriptStateService.transitionWithPages(
      chapterId,
      ManuscriptStatus.EDITOR_REVISION,
      { changedBy: userId, reason },
      [PageStatus.COMPLETED],
      PageStatus.REVISING
    )
    await this.notifyOwners(
      series,
      chapterId,
      ChapterMessages.notification.coOwnerRejected(reason),
      'CHAPTER_COOWNER_REJECTED'
    )
    return res
  }

  private async loadPending(userId: string, chapterId: string) {
    if (!OBJECT_ID_RE.test(chapterId)) throw ChapterNotFoundException
    const chapter = await this.chapterRepository.findChapterById(chapterId)
    if (!chapter) throw ChapterNotFoundException
    const series = await this.chapterRepository.findSeriesById(chapter.seriesId)
    if (!series) throw ChapterNotFoundException
    // Chỉ co-owner của series được duyệt (BR-TRANSFER-03).
    if (!series.coOwnerId || series.coOwnerId !== userId) throw NotCoOwnerException
    const approval = await this.chapterRepository.findCoOwnerApprovalByChapterId(chapterId)
    if (!approval) throw CoOwnerApprovalNotFoundException
    if (approval.status !== CoOwnerApprovalStatus.PENDING) throw CoOwnerApprovalNotPendingException
    return { chapter, series, approval }
  }

  private async notifyOwners(
    series: { mangakaId?: string | null; editorId?: string | null },
    chapterId: string,
    content: string,
    referenceType: string
  ) {
    const recipients = [series.mangakaId, series.editorId].filter((id): id is string => !!id)
    for (const recipientId of recipients) {
      await this.notificationService.notifySafe({
        recipientId,
        type: NotificationType.REVIEW,
        referenceId: chapterId,
        referenceType,
        content
      })
    }
  }
}
