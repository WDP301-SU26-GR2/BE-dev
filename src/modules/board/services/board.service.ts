import { Injectable } from '@nestjs/common'
import { BoardRepository } from '../board.repo'
import { VoteValue } from '../board.constant'
import * as Errors from '../errors/board.errors'
import {
  CreateBoardDecisionBodyDto,
  CastVoteBodyDto,
  CreateSeriesReportBodyDto,
  UpdateBoardConfigBodyDto
} from '../dto/board.dto'
import { VoteDataType } from '../schemas/board.model'

@Injectable()
export class BoardService {
  constructor(private readonly boardRepo: BoardRepository) {}

  /**
   * Lấy cấu hình tham số Hội đồng hiện tại
   */
  async getConfig() {
    const config = await this.boardRepo.getActiveConfig()
    if (!config) {
      throw new Errors.BoardConfigNotFoundException()
    }
    return config
  }

  /**
   * Khởi tạo một quyết định/phiên họp biểu quyết hội đồng mới
   */
  async createDecision(dto: CreateBoardDecisionBodyDto) {
    return this.boardRepo.createDecision(dto)
  }

  /**
   * Xử lý nghiệp vụ bỏ phiếu của đại biểu Hội đồng và tự động tính toán kết quả
   */
  async castVote(decisionId: string, dto: CastVoteBodyDto) {
    // 1. Kiểm tra Quyết định họp có tồn tại không
    const decision = await this.boardRepo.findDecisionById(decisionId)
    if (!decision) {
      throw new Errors.DecisionNotFoundException(decisionId)
    }

    // 2. Kiểm tra cuộc họp đã chốt kết quả (APPROVED/REJECTED...) chưa
    if (decision.result !== 'PENDING') {
      throw new Errors.DecisionFinalizedException()
    }

    // 3. Kiểm tra đại biểu này đã bỏ phiếu trước đó chưa (Tránh vote trùng)
    const hasVoted = decision.votes.some((v: any) => v.voterId === dto.voterId)
    if (hasVoted) {
      throw new Errors.VoterAlreadyVotedException(dto.voterId)
    }

    // 4. Lấy cấu hình điều lệ Hội đồng để chuẩn bị tính toán mẫu số
    const config = await this.getConfig()

    // 5. Khởi tạo đối tượng phiếu bầu mới
    const newVote: VoteDataType = {
      voterId: dto.voterId,
      voteValue: dto.voteValue,
      note: dto.note ?? null,
      votedAt: new Date()
    }

    // 6. Đẩy phiếu bầu mới vào Database
    await this.boardRepo.pushVoteToDecision(decisionId, newVote)

    // 7. Thực hiện tính toán lại trạng thái cuộc họp (Bao gồm cả phiếu vừa vote)
    const updatedVotes = [...decision.votes, newVote]
    const totalVotes = updatedVotes.length
    const approveCount = updatedVotes.filter((v) => v.voteValue === VoteValue.APPROVE).length
    const rejectCount = updatedVotes.filter((v) => v.voteValue === VoteValue.REJECT).length

    // Kiểm tra xem đã đạt số lượng tối thiểu tham gia biểu quyết chưa (Quorum)
    const quorumMet = totalVotes >= config.quorumMin

    // Khởi tạo các giá trị cập nhật mặc định
    let finalResult: 'PENDING' | 'APPROVED' | 'REJECTED' | 'PENDING_QUORUM' = 'PENDING'
    let decidedAt: Date | null = null

    // 🌟 LOGIC CHỐT SỔ: Khi tất cả đại biểu trong danh sách Hội đồng đã bỏ phiếu xong
    if (totalVotes >= config.boardTotalMembers) {
      decidedAt = new Date()

      if (quorumMet) {
        // Tính tỷ lệ đồng thuận dựa trên tổng số phiếu thực tế đã bầu
        const approvalRatio = approveCount / totalVotes

        // Nếu tỷ lệ thông qua lớn hơn hoặc bằng tỷ lệ cấu hình quy định (Ví dụ: 0.51)
        if (approvalRatio >= config.approveMajorityRatio) {
          finalResult = 'APPROVED'
        } else {
          finalResult = 'REJECTED'
        }
      } else {
        // Trường hợp họp xong nhưng không gom đủ sĩ số tối thiểu quy định
        finalResult = 'PENDING_QUORUM'
      }
    }

    // 8. Cập nhật kết quả tính toán mới nhất vào Database
    return this.boardRepo.updateDecisionResult(decisionId, {
      quorumMet,
      totalVotes,
      approveCount,
      rejectCount,
      result: finalResult,
      decidedAt
    })
  }

  /**
   * Tạo báo cáo phân tích số liệu đi kèm cuộc họp (Dành cho Editor)
   */
  async createSeriesReport(dto: CreateSeriesReportBodyDto) {
    // Kiểm tra tính hợp lệ xem cuộc họp đính kèm báo cáo có tồn tại không
    const decision = await this.boardRepo.findDecisionById(dto.boardDecisionId)
    if (!decision) {
      throw new Errors.DecisionNotFoundException(dto.boardDecisionId)
    }
    return this.boardRepo.createSeriesReport(dto)
  }

  /**
   * Thay đổi tham số điều lệ biểu quyết của Hội đồng (Dành cho Admin)
   */
  async updateConfig(id: string, dto: UpdateBoardConfigBodyDto) {
    // Các lệnh kiểm tra chéo (superRefine) đã được xử lý tự động ở tầng Zod Validation Pipe ngoài Gateway/Controller
    return this.boardRepo.updateConfig(id, dto)
  }
}
