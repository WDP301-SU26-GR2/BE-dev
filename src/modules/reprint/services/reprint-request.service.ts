import { Injectable } from '@nestjs/common'
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

@Injectable()
export class ReprintRequestService {
  constructor(private readonly reprintRequestRepo: ReprintRequestRepo) {}

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

    return this.reprintRequestRepo.create({
      seriesId: dto.seriesId,
      requestedBy,
      revisionMode: dto.revisionMode,
      reason: dto.reason,
      chapterRangeStart: dto.chapterRangeStart,
      chapterRangeEnd: dto.chapterRangeEnd,
      status: REPRINT_REQUEST_STATUS.PENDING,
      chapters: initialChapters
    })
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

    if (request.status !== REPRINT_REQUEST_STATUS.PENDING) {
      throw ReprintRequestErrors.InvalidStatus()
    }

    if (dto.accept) {
      return this.reprintRequestRepo.update(id, {
        status: REPRINT_REQUEST_STATUS.MANGAKA_APPROVED,
        mangakaApprovedAt: new Date()
      })
    } else {
      return this.reprintRequestRepo.update(id, {
        status: REPRINT_REQUEST_STATUS.REJECTED
      })
    }
  }

  // B-RPT-02: Hội đồng phê duyệt nội bộ quyết định chuyển sang BOARD_APPROVED (Vào luồng sản xuất)
  async boardApprove(id: string, dto: BoardApproveReprintBodyDto) {
    const request = await this.reprintRequestRepo.findById(id)
    if (!request) {
      throw ReprintRequestErrors.NotFound()
    }

    if (!dto.approve) {
      return this.reprintRequestRepo.update(id, {
        status: REPRINT_REQUEST_STATUS.REJECTED
      })
    }

    const contract = await this.reprintRequestRepo.findActiveContractBySeriesId(request.seriesId)
    if (!contract) {
      throw ReprintRequestErrors.ContractNotFound()
    }

    // AC1: FULL_BUYOUT -> Duyệt thẳng từ PENDING sang BOARD_APPROVED
    if (contract.contractType === 'FULL_BUYOUT') {
      if (request.status !== REPRINT_REQUEST_STATUS.PENDING) {
        throw ReprintRequestErrors.InvalidStatus()
      }
    }
    // AC2: REVENUE_SHARE -> Bắt buộc phải thông qua trạng thái MANGAKA_APPROVED trước
    else if (contract.contractType === 'REVENUE_SHARE') {
      if (request.status !== REPRINT_REQUEST_STATUS.MANGAKA_APPROVED) {
        throw ReprintRequestErrors.InvalidStatus()
      }
    }

    return this.reprintRequestRepo.update(id, {
      status: REPRINT_REQUEST_STATUS.BOARD_APPROVED,
      boardApprovedAt: new Date()
    })
  }

  // B-RPT-03: Giai đoạn sản xuất - Mangaka nộp file sửa đổi cho từng chương
  async submitChapterManuscript(id: string, dto: SubmitChapterManuscriptBodyDto) {
    const request = await this.reprintRequestRepo.findById(id)
    if (!request || request.status !== REPRINT_REQUEST_STATUS.BOARD_APPROVED) {
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

    return this.reprintRequestRepo.update(id, { chapters })
  }

  // B-RPT-03 & B-RPT-04: Editor kiểm duyệt từng chương và tự động hoàn tất luồng xuất bản
  async editorApproveChapter(id: string, dto: EditorApproveChapterBodyDto) {
    const request = await this.reprintRequestRepo.findById(id)
    if (!request || request.status !== REPRINT_REQUEST_STATUS.BOARD_APPROVED) {
      throw ReprintRequestErrors.InvalidStatus()
    }

    const chapters = [...request.chapters]
    const targetChapter = chapters.find((ch) => ch.originalChapterId === dto.originalChapterId)
    if (!targetChapter) {
      throw ReprintRequestErrors.ChapterNotFound()
    }

    // Editor duyệt đạt yêu cầu -> Chương chuyển sang PUBLISHED
    if (dto.approve) {
      targetChapter.status = REPRINT_CHAPTER_STATUS.PUBLISHED
    } else {
      targetChapter.status = REPRINT_CHAPTER_STATUS.IN_REVISION
    }

    // B-RPT-04: Kiểm tra nếu toàn bộ các chương trong danh sách đã đạt trạng thái PUBLISHED
    const allChaptersPublished = chapters.every((ch) => ch.status === REPRINT_CHAPTER_STATUS.PUBLISHED)

    if (allChaptersPublished) {
      const contract = await this.reprintRequestRepo.findActiveContractBySeriesId(request.seriesId)

      // AC2: REVENUE_SHARE -> Thực hiện chia doanh thu tại đây (B-CON-07)
      if (contract && contract.contractType === 'REVENUE_SHARE') {
        // Tích hợp logic xử lý chia sẻ doanh thu tương ứng với cấu trúc DB
      }

      return this.reprintRequestRepo.update(id, {
        chapters,
        status: REPRINT_REQUEST_STATUS.PUBLISHED,
        publishedAt: new Date()
      })
    }

    return this.reprintRequestRepo.update(id, { chapters })
  }
}
