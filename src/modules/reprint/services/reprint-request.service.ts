import { Injectable } from '@nestjs/common'
import { NotificationType } from '@prisma/client'
import { ReprintRequestRepo } from '../reprint-request.repo'
import { ReprintRequestErrors } from '../errors/reprint-request.error'
import {
  CreateReprintRequestBodyDto,
  MangakaReviewReprintBodyDto,
  BoardApproveReprintBodyDto,
  SubmitChapterManuscriptBodyDto,
  EditorApproveChapterBodyDto
} from '../dto/reprint-request.dto'
import { REPRINT_REQUEST_STATUS, REPRINT_CHAPTER_STATUS } from '../reprint-request.constant'
import { NotificationService } from 'src/modules/notification/notification.service'

@Injectable()
export class ReprintRequestService {
  constructor(
    private readonly reprintRequestRepo: ReprintRequestRepo,
    private readonly notificationService: NotificationService
  ) {}

  async findAll(requestedBy: string, filters: { status?: string; seriesId?: string }) {
    return this.reprintRequestRepo.findMany({ requestedBy, ...filters })
  }

  async findById(id: string) {
    const request = await this.reprintRequestRepo.findById(id)
    if (!request) {
      throw ReprintRequestErrors.NotFound()
    }
    return request
  }

  async getChapters(id: string) {
    const request = await this.reprintRequestRepo.findById(id)
    if (!request) {
      throw ReprintRequestErrors.NotFound()
    }
    return request.chapters ?? []
  }

  async getChapterById(id: string, chapterId: string) {
    const request = await this.reprintRequestRepo.findById(id)
    if (!request) {
      throw ReprintRequestErrors.NotFound()
    }

    const chapter = request.chapters?.find((item) => item.originalChapterId === chapterId)
    if (!chapter) {
      throw ReprintRequestErrors.ChapterNotFound()
    }

    return chapter
  }

  async updateChapterManuscript(id: string, chapterId: string, dto: SubmitChapterManuscriptBodyDto) {
    const request = await this.reprintRequestRepo.findById(id)
    if (!request) {
      throw ReprintRequestErrors.NotFound()
    }

    const chapters = [...(request.chapters ?? [])]
    const targetChapter = chapters.find((item) => item.originalChapterId === chapterId)
    if (!targetChapter) {
      throw ReprintRequestErrors.ChapterNotFound()
    }

    targetChapter.manuscriptFile = dto.manuscriptFile
    targetChapter.status = REPRINT_CHAPTER_STATUS.READY

    const updated = await this.reprintRequestRepo.update(id, { chapters })
    return updated
  }

  async approveChapter(id: string, chapterId: string, dto: EditorApproveChapterBodyDto) {
    const request = await this.reprintRequestRepo.findById(id)
    if (!request) {
      throw ReprintRequestErrors.NotFound()
    }

    const chapters = [...(request.chapters ?? [])]
    const targetChapter = chapters.find((item) => item.originalChapterId === chapterId)
    if (!targetChapter) {
      throw ReprintRequestErrors.ChapterNotFound()
    }

    targetChapter.status = dto.approve ? REPRINT_CHAPTER_STATUS.APPROVED : REPRINT_CHAPTER_STATUS.IN_REVISION

    const updated = await this.reprintRequestRepo.update(id, { chapters })
    return updated
  }

  // B-RPT-01: Tạo ReprintRequest ban đầu ở trạng thái PENDING
  async create(requestedBy: string, dto: CreateReprintRequestBodyDto) {
    const contract = await this.reprintRequestRepo.findActiveContractBySeriesId(dto.seriesId)
    if (!contract) {
      throw ReprintRequestErrors.ContractNotFound()
    }

    const originalChapters = await this.reprintRequestRepo.findOriginalChaptersByRange(
      dto.seriesId,
      dto.chapterRangeStart,
      dto.chapterRangeEnd
    )
    if (!originalChapters || originalChapters.length === 0) {
      throw ReprintRequestErrors.OriginalChaptersNotFound()
    }

    // Khởi tạo danh sách embedded chapters với trạng thái mặc định PENDING từ constant
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
        content: 'Yêu cầu tái bản đã được tạo và đang chờ xử lý.'
      }),
      contract?.mangakaId
        ? this.notificationService.notifySafe({
            recipientId: contract.mangakaId,
            type: NotificationType.CONTRACT,
            referenceId: createdRequest.id,
            referenceType: 'REPRINT_REQUEST_CREATED',
            content: 'Có yêu cầu tái bản mới cần bạn xem xét.'
          })
        : Promise.resolve()
    ])

    return createdRequest
  }

  // B-RPT-02: Nhánh theo Ownership Principle - Mangaka Review (Chỉ dành cho REVENUE_SHARE)
  async mangakaReview(id: string, dto: MangakaReviewReprintBodyDto) {
    const request = await this.reprintRequestRepo.findById(id)
    if (!request) {
      throw ReprintRequestErrors.NotFound()
    }

    const contract = await this.reprintRequestRepo.findActiveContractBySeriesId(request.seriesId)
    if (!contract || contract.contractType !== 'REVENUE_SHARE') {
      throw ReprintRequestErrors.ActionNotAllowed()
    }

    if (request.status !== REPRINT_REQUEST_STATUS.PENDING && request.status !== REPRINT_REQUEST_STATUS.PROPOSED) {
      throw ReprintRequestErrors.InvalidStatus()
    }

    if (dto.accept) {
      const updated = await this.reprintRequestRepo.update(id, {
        status: REPRINT_REQUEST_STATUS.MANGAKA_APPROVED,
        mangakaApprovedAt: new Date()
      })
      await this.notificationService.notifySafe({
        recipientId: request.requestedBy ?? '',
        type: NotificationType.CONTRACT,
        referenceId: updated.id,
        referenceType: 'REPRINT_REQUEST_MANGAKA_APPROVED',
        content: 'Mangaka đã đồng ý yêu cầu tái bản.'
      })
      return updated
    } else {
      const updated = await this.reprintRequestRepo.update(id, {
        status: REPRINT_REQUEST_STATUS.REJECTED
      })
      await this.notificationService.notifySafe({
        recipientId: request.requestedBy ?? '',
        type: NotificationType.CONTRACT,
        referenceId: updated.id,
        referenceType: 'REPRINT_REQUEST_REJECTED',
        content: 'Yêu cầu tái bản đã bị từ chối.'
      })
      return updated
    }
  }

  // B-RPT-02: Hội đồng phê duyệt nội bộ quyết định chuyển sang BOARD_APPROVED (Vào luồng sản xuất)
  async boardApprove(id: string, dto: BoardApproveReprintBodyDto) {
    const request = await this.reprintRequestRepo.findById(id)
    if (!request) {
      throw ReprintRequestErrors.NotFound()
    }

    if (!dto.approve) {
      const updated = await this.reprintRequestRepo.update(id, {
        status: REPRINT_REQUEST_STATUS.REJECTED
      })
      await this.notificationService.notifySafe({
        recipientId: request.requestedBy ?? '',
        type: NotificationType.CONTRACT,
        referenceId: updated.id,
        referenceType: 'REPRINT_REQUEST_REJECTED',
        content: 'Yêu cầu tái bản đã bị Hội đồng từ chối.'
      })
      return updated
    }

    const contract = await this.reprintRequestRepo.findActiveContractBySeriesId(request.seriesId)
    if (!contract) {
      throw ReprintRequestErrors.ContractNotFound()
    }

    // AC1: FULL_BUYOUT -> Duyệt thẳng từ PENDING sang BOARD_APPROVED
    if (contract.contractType === 'FULL_BUYOUT') {
      if (request.status !== REPRINT_REQUEST_STATUS.PENDING && request.status !== REPRINT_REQUEST_STATUS.PROPOSED) {
        throw ReprintRequestErrors.InvalidStatus()
      }
    }
    // AC2: REVENUE_SHARE -> Bắt buộc phải thông qua trạng thái MANGAKA_APPROVED trước
    else if (contract.contractType === 'REVENUE_SHARE') {
      if (
        request.status !== REPRINT_REQUEST_STATUS.MANGAKA_APPROVED &&
        request.status !== REPRINT_REQUEST_STATUS.MANGAKA_REVIEW
      ) {
        throw ReprintRequestErrors.InvalidStatus()
      }
    }

    const updated = await this.reprintRequestRepo.update(id, {
      status: REPRINT_REQUEST_STATUS.BOARD_APPROVED,
      boardApprovedAt: new Date()
    })

    await Promise.all([
      this.notificationService.notifySafe({
        recipientId: request.requestedBy ?? '',
        type: NotificationType.CONTRACT,
        referenceId: updated.id,
        referenceType: 'REPRINT_REQUEST_BOARD_APPROVED',
        content: 'Yêu cầu tái bản đã được Hội đồng phê duyệt.'
      }),
      contract?.mangakaId
        ? this.notificationService.notifySafe({
            recipientId: contract.mangakaId,
            type: NotificationType.CONTRACT,
            referenceId: updated.id,
            referenceType: 'REPRINT_REQUEST_BOARD_APPROVED',
            content: 'Yêu cầu tái bản đã được Hội đồng phê duyệt.'
          })
        : Promise.resolve()
    ])

    return updated
  }

  // B-RPT-03: Giai đoạn sản xuất - Mangaka nộp file sửa đổi cho từng chương
  async submitChapterManuscript(id: string, dto: SubmitChapterManuscriptBodyDto) {
    const request = await this.reprintRequestRepo.findById(id)
    if (
      !request ||
      (request.status !== REPRINT_REQUEST_STATUS.BOARD_APPROVED && request.status !== REPRINT_REQUEST_STATUS.APPROVED)
    ) {
      throw ReprintRequestErrors.InvalidStatus()
    }

    const chapters = [...request.chapters]
    const targetChapter = chapters.find((ch) => ch.originalChapterId === dto.originalChapterId)
    if (!targetChapter) {
      throw ReprintRequestErrors.ChapterNotFound()
    }

    // Cập nhật file sửa đổi và chuyển trạng thái chương sang READY
    targetChapter.manuscriptFile = dto.manuscriptFile
    targetChapter.status = REPRINT_CHAPTER_STATUS.READY

    const updated = await this.reprintRequestRepo.update(id, { chapters })
    await this.notificationService.notifySafe({
      recipientId: request.requestedBy ?? '',
      type: NotificationType.CONTRACT,
      referenceId: updated.id,
      referenceType: 'REPRINT_CHAPTER_SUBMITTED',
      content: 'Mangaka đã nộp bản thảo cho chương tái bản.'
    })
    return updated
  }

  // B-RPT-03 & B-RPT-04: Editor kiểm duyệt từng chương và tự động hoàn tất luồng xuất bản
  async editorApproveChapter(id: string, dto: EditorApproveChapterBodyDto) {
    const request = await this.reprintRequestRepo.findById(id)
    if (
      !request ||
      (request.status !== REPRINT_REQUEST_STATUS.BOARD_APPROVED && request.status !== REPRINT_REQUEST_STATUS.APPROVED)
    ) {
      throw ReprintRequestErrors.InvalidStatus()
    }

    const chapters = [...request.chapters]
    const targetChapter = chapters.find((ch) => ch.originalChapterId === dto.originalChapterId)
    if (!targetChapter) {
      throw ReprintRequestErrors.ChapterNotFound()
    }

    // Editor duyệt đạt yêu cầu -> Chương chuyển sang PUBLISHED
    if (dto.approve) {
      targetChapter.status = REPRINT_CHAPTER_STATUS.APPROVED
    } else {
      targetChapter.status = REPRINT_CHAPTER_STATUS.IN_REVISION
    }

    // B-RPT-04: Kiểm tra nếu toàn bộ các chương trong danh sách đã đạt trạng thái APPROVED
    const allChaptersPublished = chapters.every((ch) => ch.status === REPRINT_CHAPTER_STATUS.APPROVED)

    if (allChaptersPublished) {
      const contract = await this.reprintRequestRepo.findActiveContractBySeriesId(request.seriesId)

      // AC2: REVENUE_SHARE -> Thực hiện chia doanh thu tại đây (B-CON-07)
      if (contract && contract.contractType === 'REVENUE_SHARE') {
        // Tích hợp logic xử lý chia sẻ doanh thu tương ứng với cấu trúc DB
      }

      const updated = await this.reprintRequestRepo.update(id, {
        chapters,
        status: REPRINT_REQUEST_STATUS.PUBLISHED,
        publishedAt: new Date()
      })

      await Promise.all([
        this.notificationService.notifySafe({
          recipientId: request.requestedBy ?? '',
          type: NotificationType.CONTRACT,
          referenceId: updated.id,
          referenceType: 'REPRINT_REQUEST_PUBLISHED',
          content: 'Tất cả chương tái bản đã được phê duyệt và công bố.'
        }),
        contract?.mangakaId
          ? this.notificationService.notifySafe({
              recipientId: contract.mangakaId,
              type: NotificationType.CONTRACT,
              referenceId: updated.id,
              referenceType: 'REPRINT_REQUEST_PUBLISHED',
              content: 'Tất cả chương tái bản đã được phê duyệt và công bố.'
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
      content: 'Chương tái bản đã được duyệt/review và đang chờ hoàn tất luồng.'
    })
    return updated
  }
}
