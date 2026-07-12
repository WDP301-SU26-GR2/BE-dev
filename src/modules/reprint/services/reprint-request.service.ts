import { Injectable } from '@nestjs/common'
import { AuditEntityType, NotificationType } from '@prisma/client'
import { ReprintRequestRepo } from '../reprint-request.repo'
import { ReprintRequestErrors } from '../errors/reprint-request.error'
import {
  CreateReprintRequestBodyDto,
  MangakaReviewReprintBodyDto,
  BoardApproveReprintBodyDto,
  EditorApproveChapterBodyDto,
  SubmitChapterManuscriptBodyDto
} from '../dto/reprint-request.dto'
import { AssignReviserBodyType } from '../schemas/reprint-request-schema'
import { REPRINT_CHAPTER_STATUS, REPRINT_REQUEST_STATUS } from '../reprint-request.constant'
import { ReprintRequestMessages } from '../reprint-request.messages'
import { NotificationService } from 'src/modules/notification/notification.service'
import { AuditService } from 'src/modules/audit/audit.service'
import { ReprintRequestStateService } from './reprint-request-state.service'

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/

@Injectable()
export class ReprintRequestService {
  constructor(
    private readonly reprintRequestRepo: ReprintRequestRepo,
    private readonly notificationService: NotificationService,
    private readonly auditService: AuditService,
    private readonly stateService: ReprintRequestStateService
  ) {}

  // ─── READ paths ─────────────────────────────────────────────────────────────

  async findAll(userId: string, roleName: string, filters: { status?: string; seriesId?: string }) {
    return this.reprintRequestRepo.findManyScoped({
      userId,
      roleName,
      status: filters.status,
      seriesId: filters.seriesId
    })
  }

  async findById(id: string) {
    if (!OBJECT_ID_RE.test(id)) throw ReprintRequestErrors.NotFound()
    const request = await this.reprintRequestRepo.findById(id)
    if (!request) throw ReprintRequestErrors.NotFound()
    return request
  }

  async getChapters(id: string) {
    if (!OBJECT_ID_RE.test(id)) throw ReprintRequestErrors.NotFound()
    const request = await this.reprintRequestRepo.findById(id)
    if (!request) throw ReprintRequestErrors.NotFound()
    return request.chapters ?? []
  }

  async getChapterById(id: string, chapterId: string) {
    // chapterId is also an ObjectId (Prisma stores originalChapterId as @db.ObjectId).
    if (!OBJECT_ID_RE.test(id) || !OBJECT_ID_RE.test(chapterId)) throw ReprintRequestErrors.NotFound()
    const request = await this.reprintRequestRepo.findById(id)
    if (!request) throw ReprintRequestErrors.NotFound()

    const chapter = request.chapters?.find((item) => item.originalChapterId === chapterId)
    if (!chapter) throw ReprintRequestErrors.ChapterNotFound()

    return chapter
  }

  // ─── B-RPT-03: Mangaka cập nhật manuscript (route duy nhất — params:chapterId) ──

  async updateChapterManuscript(id: string, chapterId: string, dto: SubmitChapterManuscriptBodyDto, actorId?: string) {
    if (!OBJECT_ID_RE.test(id) || !OBJECT_ID_RE.test(chapterId)) throw ReprintRequestErrors.NotFound()
    const request = await this.reprintRequestRepo.findById(id)
    if (!request) throw ReprintRequestErrors.NotFound()
    if (
      request.status !== REPRINT_REQUEST_STATUS.BOARD_APPROVED &&
      request.status !== REPRINT_REQUEST_STATUS.APPROVED
    ) {
      throw ReprintRequestErrors.InvalidReprintTransition()
    }

    const chapters = [...(request.chapters ?? [])]
    const targetChapter = chapters.find((item) => item.originalChapterId === chapterId)
    if (!targetChapter) throw ReprintRequestErrors.ChapterNotFound()

    targetChapter.manuscriptFile = dto.manuscriptFile
    targetChapter.status = REPRINT_CHAPTER_STATUS.READY

    const updated = await this.reprintRequestRepo.update(id, { chapters })
    await this.notificationService.notifySafe({
      recipientId: request.requestedBy ?? '',
      type: NotificationType.CONTRACT,
      referenceId: updated.id,
      referenceType: 'REPRINT_CHAPTER_SUBMITTED',
      content: ReprintRequestMessages.notification.chapterSubmitted
    })
    // PB-07 / audit: ghi nhận submission để Board truy vết được.
    if (actorId) {
      await this.auditService.record({
        actorId,
        entityType: AuditEntityType.REPRINT_REQUEST,
        entityId: id,
        action: 'CHAPTER_MANUSCRIPT_SUBMITTED',
        reason: `chapter=${chapterId}`
      })
    }
    return updated
  }

  // ─── B-RPT-03 + B-RPT-04: Editor duyệt chapter (route duy nhất — params:chapterId)
  //                        + auto-publish khi tất cả chapters đạt APPROVED.

  async approveChapter(id: string, chapterId: string, dto: EditorApproveChapterBodyDto, actorId: string) {
    if (!OBJECT_ID_RE.test(id) || !OBJECT_ID_RE.test(chapterId)) throw ReprintRequestErrors.NotFound()
    const request = await this.reprintRequestRepo.findById(id)
    if (!request) throw ReprintRequestErrors.NotFound()
    if (
      request.status !== REPRINT_REQUEST_STATUS.BOARD_APPROVED &&
      request.status !== REPRINT_REQUEST_STATUS.APPROVED
    ) {
      throw ReprintRequestErrors.InvalidReprintTransition()
    }

    const chapters = [...(request.chapters ?? [])]
    const targetChapter = chapters.find((item) => item.originalChapterId === chapterId)
    if (!targetChapter) throw ReprintRequestErrors.ChapterNotFound()

    targetChapter.status = dto.approve ? REPRINT_CHAPTER_STATUS.APPROVED : REPRINT_CHAPTER_STATUS.IN_REVISION

    const allChaptersPublished = chapters.every((ch) => ch.status === REPRINT_CHAPTER_STATUS.APPROVED)

    if (allChaptersPublished) {
      // B-RPT-04: state transition BOARD_APPROVED/APPROVED → PUBLISHED (doanh thu chia sau qua POST /contracts/:id/revenue).
      this.stateService.assertTransition(request.status, REPRINT_REQUEST_STATUS.PUBLISHED)

      const contract = await this.reprintRequestRepo.findActiveContractBySeriesId(request.seriesId)

      const updated = await this.reprintRequestRepo.update(id, {
        chapters,
        status: REPRINT_REQUEST_STATUS.PUBLISHED,
        publishedAt: new Date()
      })

      await this.stateService.audit(
        id,
        request.status,
        REPRINT_REQUEST_STATUS.PUBLISHED,
        actorId,
        'all chapters approved'
      )

      await Promise.all([
        this.notificationService.notifySafe({
          recipientId: request.requestedBy ?? '',
          type: NotificationType.CONTRACT,
          referenceId: updated.id,
          referenceType: 'REPRINT_REQUEST_PUBLISHED',
          content: ReprintRequestMessages.notification.published
        }),
        contract?.mangakaId
          ? this.notificationService.notifySafe({
              recipientId: contract.mangakaId,
              type: NotificationType.CONTRACT,
              referenceId: updated.id,
              referenceType: 'REPRINT_REQUEST_PUBLISHED',
              content: ReprintRequestMessages.notification.published
            })
          : Promise.resolve()
      ])

      return updated
    }

    const updated = await this.reprintRequestRepo.update(id, { chapters })
    await this.notificationService.notifySafe({
      recipientId: request.requestedBy ?? '',
      type: NotificationType.CONTRACT,
      referenceId: updated.id,
      referenceType: 'REPRINT_CHAPTER_REVIEWED',
      content: ReprintRequestMessages.notification.chapterReviewed
    })
    return updated
  }

  // ─── B-RPT-01: Tạo ReprintRequest ban đầu ở trạng thái PENDING ────────────────

  async create(requestedBy: string, dto: CreateReprintRequestBodyDto) {
    if (!OBJECT_ID_RE.test(dto.seriesId)) throw ReprintRequestErrors.ContractNotFound()
    const contract = await this.reprintRequestRepo.findActiveContractBySeriesId(dto.seriesId)
    if (!contract) throw ReprintRequestErrors.ContractNotFound()

    const originalChapters = await this.reprintRequestRepo.findOriginalChaptersByRange(
      dto.seriesId,
      dto.chapterRangeStart,
      dto.chapterRangeEnd
    )
    if (!originalChapters || originalChapters.length === 0) throw ReprintRequestErrors.OriginalChaptersNotFound()

    const initialChapters = originalChapters.map((ch) => ({
      originalChapterId: ch.id,
      manuscriptFile: null,
      status: REPRINT_CHAPTER_STATUS.PENDING
    }))

    const createdRequest = await this.reprintRequestRepo.create({
      seriesId: dto.seriesId,
      requestedBy,
      revisionMode: dto.revisionMode,
      reason: dto.reason,
      chapterRangeStart: dto.chapterRangeStart,
      chapterRangeEnd: dto.chapterRangeEnd,
      status: REPRINT_REQUEST_STATUS.PENDING,
      chapters: initialChapters
    })

    await Promise.all([
      this.notificationService.notifySafe({
        recipientId: requestedBy,
        type: NotificationType.CONTRACT,
        referenceId: createdRequest.id,
        referenceType: 'REPRINT_REQUEST_CREATED',
        content: ReprintRequestMessages.notification.created
      }),
      contract?.mangakaId
        ? this.notificationService.notifySafe({
            recipientId: contract.mangakaId,
            type: NotificationType.CONTRACT,
            referenceId: createdRequest.id,
            referenceType: 'REPRINT_REQUEST_CREATED',
            content: ReprintRequestMessages.notification.createdForMangaka
          })
        : Promise.resolve()
    ])

    return createdRequest
  }

  // ─── B-RPT-02: Mangaka Review (chỉ dành cho REVENUE_SHARE) ────────────────────

  async mangakaReview(id: string, dto: MangakaReviewReprintBodyDto, actorId: string) {
    if (!OBJECT_ID_RE.test(id)) throw ReprintRequestErrors.NotFound()
    const request = await this.reprintRequestRepo.findById(id)
    if (!request) throw ReprintRequestErrors.NotFound()

    const contract = await this.reprintRequestRepo.findActiveContractBySeriesId(request.seriesId)
    if (!contract || contract.contractType !== 'REVENUE_SHARE') {
      throw ReprintRequestErrors.ActionNotAllowed()
    }

    // Ownership Principle (BR-CONTRACT-03): chỉ Mangaka của hợp đồng series này được review.
    if (contract.mangakaId !== actorId) {
      throw ReprintRequestErrors.ActionNotAllowed()
    }

    if (request.status !== REPRINT_REQUEST_STATUS.PENDING && request.status !== REPRINT_REQUEST_STATUS.PROPOSED) {
      throw ReprintRequestErrors.InvalidReprintTransition()
    }

    if (dto.accept) {
      this.stateService.assertTransition(request.status, REPRINT_REQUEST_STATUS.MANGAKA_APPROVED)
      const updated = await this.reprintRequestRepo.update(id, {
        status: REPRINT_REQUEST_STATUS.MANGAKA_APPROVED,
        mangakaApprovedAt: new Date()
      })
      await this.stateService.audit(
        id,
        request.status,
        REPRINT_REQUEST_STATUS.MANGAKA_APPROVED,
        actorId,
        'mangaka review accepted'
      )
      await this.notificationService.notifySafe({
        recipientId: request.requestedBy ?? '',
        type: NotificationType.CONTRACT,
        referenceId: updated.id,
        referenceType: 'REPRINT_REQUEST_MANGAKA_APPROVED',
        content: ReprintRequestMessages.notification.mangakaApproved
      })
      return updated
    }

    // B-RPT-02 AC2: Mangaka từ chối → REJECTED_BY_MANGAKA (phân biệt với Board reject → REJECTED).
    this.stateService.assertTransition(request.status, REPRINT_REQUEST_STATUS.REJECTED_BY_MANGAKA)
    const updated = await this.reprintRequestRepo.update(id, { status: REPRINT_REQUEST_STATUS.REJECTED_BY_MANGAKA })
    await this.stateService.audit(
      id,
      request.status,
      REPRINT_REQUEST_STATUS.REJECTED_BY_MANGAKA,
      actorId,
      'mangaka review rejected'
    )
    await this.notificationService.notifySafe({
      recipientId: request.requestedBy ?? '',
      type: NotificationType.CONTRACT,
      referenceId: updated.id,
      referenceType: 'REPRINT_REQUEST_REJECTED',
      content: ReprintRequestMessages.notification.mangakaRejected
    })
    return updated
  }

  // ─── B-RPT-02: Board phê duyệt (vào luồng sản xuất) ─────────────────────────────

  async boardApprove(id: string, dto: BoardApproveReprintBodyDto, actorId: string) {
    if (!OBJECT_ID_RE.test(id)) throw ReprintRequestErrors.NotFound()
    const request = await this.reprintRequestRepo.findById(id)
    if (!request) throw ReprintRequestErrors.NotFound()

    if (!dto.approve) {
      this.stateService.assertTransition(request.status, REPRINT_REQUEST_STATUS.REJECTED)
      const updated = await this.reprintRequestRepo.update(id, { status: REPRINT_REQUEST_STATUS.REJECTED })
      await this.stateService.audit(id, request.status, REPRINT_REQUEST_STATUS.REJECTED, actorId, 'board rejected')
      await this.notificationService.notifySafe({
        recipientId: request.requestedBy ?? '',
        type: NotificationType.CONTRACT,
        referenceId: updated.id,
        referenceType: 'REPRINT_REQUEST_REJECTED',
        content: ReprintRequestMessages.notification.boardRejected
      })
      return updated
    }

    const contract = await this.reprintRequestRepo.findActiveContractBySeriesId(request.seriesId)
    if (!contract) throw ReprintRequestErrors.ContractNotFound()

    // AC1: FULL_BUYOUT → PENDING/PROPOSED → BOARD_APPROVED trực tiếp.
    if (contract.contractType === 'FULL_BUYOUT') {
      if (request.status !== REPRINT_REQUEST_STATUS.PENDING && request.status !== REPRINT_REQUEST_STATUS.PROPOSED) {
        throw ReprintRequestErrors.InvalidReprintTransition()
      }
    }
    // AC2: REVENUE_SHARE → phải qua MANGAKA_APPROVED.
    else if (contract.contractType === 'REVENUE_SHARE') {
      if (
        request.status !== REPRINT_REQUEST_STATUS.MANGAKA_APPROVED &&
        request.status !== REPRINT_REQUEST_STATUS.MANGAKA_REVIEW
      ) {
        throw ReprintRequestErrors.InvalidReprintTransition()
      }
    }

    this.stateService.assertTransition(request.status, REPRINT_REQUEST_STATUS.BOARD_APPROVED)
    const updated = await this.reprintRequestRepo.update(id, {
      status: REPRINT_REQUEST_STATUS.BOARD_APPROVED,
      boardApprovedAt: new Date()
    })
    await this.stateService.audit(id, request.status, REPRINT_REQUEST_STATUS.BOARD_APPROVED, actorId, 'board approved')

    await Promise.all([
      this.notificationService.notifySafe({
        recipientId: request.requestedBy ?? '',
        type: NotificationType.CONTRACT,
        referenceId: updated.id,
        referenceType: 'REPRINT_REQUEST_BOARD_APPROVED',
        content: ReprintRequestMessages.notification.boardApproved
      }),
      contract?.mangakaId
        ? this.notificationService.notifySafe({
            recipientId: contract.mangakaId,
            type: NotificationType.CONTRACT,
            referenceId: updated.id,
            referenceType: 'REPRINT_REQUEST_BOARD_APPROVED',
            content: ReprintRequestMessages.notification.boardApproved
          })
        : Promise.resolve()
    ])

    return updated
  }

  // ─── PB-07: Gán reviser cho chapter tái bản (chỉ khi WITH_REVISION + FULL_BUYOUT) ──

  async assignReviser(id: string, chapterId: string, dto: AssignReviserBodyType, actorId: string) {
    if (!OBJECT_ID_RE.test(id) || !OBJECT_ID_RE.test(chapterId)) throw ReprintRequestErrors.NotFound()
    const request = await this.reprintRequestRepo.findById(id)
    if (!request) throw ReprintRequestErrors.NotFound()
    if (request.revisionMode !== 'WITH_REVISION') throw ReprintRequestErrors.NotWithRevision()

    const contract = await this.reprintRequestRepo.findActiveContractBySeriesId(request.seriesId)
    if (!contract || contract.contractType !== 'FULL_BUYOUT') {
      throw ReprintRequestErrors.ReviserOnlyForFullBuyout()
    }

    if (dto.reviserType === 'OTHER_MANGAKA') {
      const user = await this.reprintRequestRepo.findUserRole(dto.reviserId)
      if (!user || user.role?.code !== 'MANGAKA') throw ReprintRequestErrors.ReviserMangakaNotFound()
    }

    const chapters = [...(request.chapters ?? [])]
    const target = chapters.find((c) => c.originalChapterId === chapterId)
    if (!target) throw ReprintRequestErrors.ChapterNotFound()
    target.reviserId = dto.reviserId
    target.reviserType = dto.reviserType

    const updated = await this.reprintRequestRepo.update(id, { chapters })
    await this.notificationService.notifySafe({
      recipientId: dto.reviserId,
      type: NotificationType.CONTRACT,
      referenceId: id,
      referenceType: 'REPRINT_REVISION_ASSIGNED',
      content: ReprintRequestMessages.notification.reviserAssigned
    })
    await this.auditService.record({
      actorId,
      entityType: AuditEntityType.REPRINT_REQUEST,
      entityId: id,
      action: 'REVISER_ASSIGNED',
      reason: ReprintRequestMessages.reason.reviserAssigned(dto.reviserType, dto.reviserId, chapterId)
    })
    return updated
  }
}
