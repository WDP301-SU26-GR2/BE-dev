import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/infrastructure/database/prisma.service' // Đảm bảo đường dẫn này đúng với project của bạn
import { CreateBoardDecisionBodyDto, CreateSeriesReportBodyDto, UpdateBoardConfigBodyDto } from './dto/board.dto'
import { VoteDataType } from './schemas/board.model'

@Injectable()
export class BoardRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lấy cấu hình biểu quyết đang hoạt động (Mặc định) của Hội đồng.
   */
  async getActiveConfig() {
    return this.prisma.boardConfig.findFirst()
  }

  /**
   * Tìm kiếm thông tin chi tiết của một Quyết định họp qua ID.
   */
  async findDecisionById(id: string) {
    return this.prisma.boardDecision.findUnique({
      where: { id }
    })
  }

  /**
   * Khởi tạo bản ghi Quyết định họp mới với trạng thái ban đầu là PENDING.
   */
  async createDecision(dto: CreateBoardDecisionBodyDto) {
    return this.prisma.boardDecision.create({
      data: {
        boardSessionId: dto.boardSessionId,
        targetSeriesId: dto.targetSeriesId ?? null,
        decisionType: dto.decisionType,
        details: dto.details ?? null,
        result: 'PENDING', // Giá trị khởi tạo mặc định thuần chuỗi an toàn
        approveCount: 0,
        rejectCount: 0,
        totalVotes: 0,
        quorumMet: false,
        votes: [] // Khởi tạo mảng phiếu bầu rỗng (MongoDB composite/embedded array)
      }
    })
  }

  /**
   * Đẩy một phiếu bầu mới (Vote Object) vào mảng phiếu bầu của Quyết định họp.
   * Cú pháp { push: vote } tối ưu hoàn hảo cho cấu trúc Embedded Documents của Prisma MongoDB.
   */
  async pushVoteToDecision(id: string, vote: VoteDataType) {
    return this.prisma.boardDecision.update({
      where: { id },
      data: {
        votes: {
          push: vote
        }
      }
    })
  }

  /**
   * Cập nhật kết quả tính toán cuối cùng (Số phiếu, Đạt Quorum, Trạng thái) của cuộc họp.
   */
  async updateDecisionResult(
    id: string,
    data: {
      quorumMet: boolean
      totalVotes: number
      approveCount: number
      rejectCount: number
      result: 'PENDING' | 'APPROVED' | 'REJECTED' | 'PENDING_QUORUM'
      decidedAt?: Date | null
    }
  ) {
    return this.prisma.boardDecision.update({
      where: { id },
      data
    })
  }

  /**
   * Lưu trữ báo cáo phân tích số liệu xu hướng đính kèm phiên họp của Editor.
   */
  async createSeriesReport(dto: CreateSeriesReportBodyDto) {
    return this.prisma.seriesReport.create({
      data: {
        seriesId: dto.seriesId,
        boardDecisionId: dto.boardDecisionId,
        preparedBy: dto.preparedBy,
        reportType: dto.reportType,
        content: dto.content,
        attachments: dto.attachments ?? []
      }
    })
  }

  /**
   * Thay đổi điều lệ và cấu trúc tham số đại biểu Hội đồng (Admin).
   */
  async updateConfig(id: string, dto: UpdateBoardConfigBodyDto) {
    return this.prisma.boardConfig.update({
      where: { id },
      data: {
        boardTotalMembers: dto.boardTotalMembers,
        quorumMin: dto.quorumMin,
        approveMajorityRatio: dto.approveMajorityRatio,
        updatedBy: dto.updatedBy,
        updatedAt: new Date()
      }
    })
  }

  /**
   * Cung cấp Prisma Client gốc để chạy các Transaction liên module (nếu cần ở tầng Service).
   */
  getPrismaClient() {
    return this.prisma
  }
}
