import { Injectable } from '@nestjs/common'
import { BoardRepository } from '../board.repo'
import * as Errors from '../errors/board.errors'
import {
  CreateBoardDecisionBodyDto,
  CastVoteBodyDto,
  CreateSeriesReportBodyDto,
  UpdateBoardConfigBodyDto,
  CreateBoardSessionBodyDto
} from '../dto/board.dto'
import { BoardGateway } from '../board.gateway'
import { $Enums, NotificationType } from '@prisma/client'
import { BoardDecisionDataType } from '../schemas/board.model'
import { NotificationService } from 'src/modules/notification/notification.service'

@Injectable()
export class BoardService {
  constructor(
    private readonly boardRepo: BoardRepository,
    private readonly boardGateway: BoardGateway,
    private readonly notificationService: NotificationService
  ) {}

  /**
   * 1. Tạo Session
   */
  async createSession(creatorId: string, dto: CreateBoardSessionBodyDto) {
    const isSessionExist = await this.boardRepo.findActiveSessionByTitle(dto.title)
    if (isSessionExist) {
      throw new Errors.SessionAlreadyExistsException(dto.title)
    }
    const createdSession = await this.boardRepo.createSession(creatorId, dto)

    const recipients = Array.from(new Set([creatorId, ...dto.allowedEditorIds]))
    await Promise.all(
      recipients.map((recipientId) =>
        this.notificationService.notifySafe({
          recipientId,
          type: NotificationType.BOARD,
          referenceId: createdSession.id,
          referenceType: 'BOARD_SESSION_CREATED',
          content: `Phiên họp Hội đồng "${dto.title}" đã được tạo và đang chờ triển khai.`
        })
      )
    )

    return createdSession
  }

  async startSessionManually(sessionId: string) {
    const session = await this.boardRepo.findSessionById(sessionId)
    if (!session) throw new Errors.SessionNotFoundException(sessionId)
    if (session.status !== $Enums.BoardSessionStatus.UPCOMING) {
      throw new Errors.SessionNotOpenException(session.status)
    }

    return this.boardRepo.updateSessionStatus(sessionId, $Enums.BoardSessionStatus.ACTIVE)
  }

  /**
   * 2. Lấy cấu hình điều lệ hiện tại
   */
  async getConfig() {
    const config = await this.boardRepo.getActiveConfig()
    if (!config) {
      throw new Errors.BoardConfigNotFoundException()
    }
    return config
  }

  /**
   * 3. Khởi tạo một Quyết định mới
   * 🛡️ RÀO CHẮN: Chặn đứng việc gán Quyết định vào một Session không tồn tại
   */
  async createDecision(dto: CreateBoardDecisionBodyDto) {
    const session = await this.boardRepo.findSessionById(dto.boardSessionId)
    if (!session) {
      throw new Errors.SessionNotFoundException(dto.boardSessionId)
    }
    const decision = await this.boardRepo.createDecision(dto)

    const recipients = Array.from(new Set([session.creatorId, ...session.allowedEditorIds]))
    await Promise.all(
      recipients.map((recipientId) =>
        this.notificationService.notifySafe({
          recipientId,
          type: NotificationType.BOARD,
          referenceId: decision.id,
          referenceType: 'BOARD_DECISION_CREATED',
          content: 'Một quyết định mới đã được tạo cho phiên họp Hội đồng.'
        })
      )
    )

    return decision
  }

  async getDecisionDetails(decisionId: string) {
    const decision = await this.boardRepo.findDecisionById(decisionId)
    if (!decision) throw new Errors.DecisionNotFoundException(decisionId)
    return decision
  }

  /**
   * 4. Đại biểu thực hiện bỏ phiếu
   * 🛡️ RÀO CHẮN: Kiểm soát chặt chẽ, ghi DB xong -> phát Realtime lập tức
   */
  async castVote(decisionId: string, voterId: string, dto: CastVoteBodyDto) {
    // Bước 1: Kiểm tra Quyết định có tồn tại thật không
    const decision = await this.boardRepo.findDecisionById(decisionId)
    if (!decision) throw new Errors.DecisionNotFoundException()

    // Bước 2: Kiểm tra Phiên họp tổng đính kèm có tồn tại thật không
    const session = await this.boardRepo.findSessionById(decision.boardSessionId)
    if (!session) throw new Errors.SessionNotFoundException(decision.boardSessionId)

    // Bước 3: Kiểm tra trạng thái phiên họp (Bắt buộc ACTIVE)
    if (session.status !== 'ACTIVE') {
      throw new Errors.SessionNotOpenException(session.status)
    }

    // Bước 4: Kiểm tra quyền danh sách đại biểu
    const isAllowed = session.allowedEditorIds.includes(voterId)
    if (!isAllowed) throw new Errors.VoterNotAllowedException()

    // Bước 5: Chặn Double-voting
    const hasVoted = decision.votes.some((vote) => vote.voterId === voterId)
    if (hasVoted) throw new Errors.VoterAlreadyVotedException(voterId)

    // Bước 6: Đẩy phiếu bầu mới vào DB
    const newVote = {
      voterId,
      voteValue: dto.voteValue,
      note: dto.note ?? null,
      votedAt: new Date()
    }
    const updatedDecision = await this.boardRepo.pushVoteToDecision(decisionId, newVote)

    // Bước 7: Tái tính toán kết quả tự động (Nhận về Promise<BoardDecisionDataType> sạch lỗi ESLint)
    const finalDecision = await this.recalculateDecisionResult(decisionId, updatedDecision.votes)
    // Bước 8: 🌟 PHÁT SÓNG REALTIME SỐ LIỆU ĐẾN PHÒNG HỌP TỔNG
    this.boardGateway.broadcastVoteProgress(decision.boardSessionId, {
      decisionId: finalDecision.id,
      approveCount: finalDecision.approveCount,
      rejectCount: finalDecision.rejectCount,
      totalVotes: finalDecision.totalVotes,
      quorumMet: finalDecision.quorumMet,
      result: finalDecision.result
    })

    return { message: 'Thực hiện bỏ phiếu thành công.' }
  }

  /**
   * 5. Hàm nội bộ tính toán kết quả vote
   * 🛡️ Kiểm soát chặt chẽ kiểu trả về Promise<BoardDecisionDataType> để diệt lỗi unsafe-return
   */
  private async recalculateDecisionResult(decisionId: string, currentVotes: any[]): Promise<BoardDecisionDataType> {
    // 🌟 Khai báo kiểu trả về cụ thể
    const config = await this.boardRepo.getActiveConfig()
    const quorumMin = config?.quorumMin ?? 1
    const majorityRatio = config?.approveMajorityRatio ?? 0.5

    const approveCount = currentVotes.filter((v) => v.voteValue === 'APPROVE').length
    const rejectCount = currentVotes.filter((v) => v.voteValue === 'REJECT').length
    const totalVotes = currentVotes.length

    const quorumMet = totalVotes >= quorumMin
    let result: 'PENDING' | 'APPROVED' | 'REJECTED' | 'PENDING_QUORUM' = 'PENDING'

    if (!quorumMet) {
      result = 'PENDING_QUORUM'
    } else {
      const winThreshold = totalVotes * majorityRatio
      if (approveCount > winThreshold) result = 'APPROVED'
      else if (rejectCount >= totalVotes - winThreshold) result = 'REJECTED'
    }

    // 🌟 ĐỊNH NGHĨA RÕ RÀNG: Tạo biến decidedAt tách biệt để tái sử dụng an toàn
    const decidedAt = result === 'APPROVED' || result === 'REJECTED' ? new Date() : null

    // 🚀 TỐI ƯU: Chỉ cần gọi 1 hàm update duy nhất gom toàn bộ các trường số liệu
    const updatedDecision = await this.boardRepo.updateDecisionCounters(decisionId, {
      quorumMet,
      totalVotes,
      approveCount,
      rejectCount,
      result,
      decidedAt
    })

    // 🌟 ÉP KIỂU ĐẦU RA AN TOÀN: Triệt tiêu hoàn toàn lỗi ESLint no-unsafe-return
    return updatedDecision
  }

  /**
   * 6. Tạo báo cáo số liệu xu hướng
   * 🛡️ RÀO CHẮN: Giải quyết dứt điểm lỗi crash bạn vừa gặp bằng kỹ thuật tách query
   */
  async createSeriesReport(userId: string, dto: CreateSeriesReportBodyDto) {
    // Bước 1: Kiểm tra Quyết định tồn tại
    const decision = await this.boardRepo.findDecisionById(dto.boardDecisionId)
    if (!decision) {
      throw new Errors.DecisionNotFoundException()
    }

    // Bước 2: Kiểm tra Phiên họp tổng tồn tại dựa trên id bóc từ bản ghi decision
    const session = await this.boardRepo.findSessionById(decision.boardSessionId)
    if (!session) {
      throw new Errors.SessionNotFoundException(decision.boardSessionId)
    }

    // Bước 3: Kiểm tra trạng thái bế mạc
    if (session.status === 'CONCLUDED') {
      throw new Errors.SessionClosedReportException()
    }

    // Bước 4: Kiểm tra phân quyền Editor có tên trong danh sách mời họp hay không
    const isInvited = session.allowedEditorIds.includes(userId)
    if (!isInvited) {
      throw new Errors.EditorNotInvitedException()
    }

    return this.boardRepo.createSeriesReport({ ...dto, preparedBy: userId })
  }

  /**
   * 7. Cập nhật cấu hình điều lệ Hội đồng
   * 🛡️ RÀO CHẮN: Chặn đứng trường hợp client gửi bừa một configId sai lệch lên URL
   */
  async updateConfig(id: string, userId: string, dto: UpdateBoardConfigBodyDto) {
    // Bước 1: Xác thực configId có thực sự tồn tại trong DB không
    const config = await this.boardRepo.findConfigById(id)
    if (!config) {
      throw new Errors.BoardConfigNotFoundException()
    }

    // Bước 2: Kiểm tra xem có phiên họp nào đang OPEN dở dang không
    const hasActiveSession = await this.boardRepo.findFirstOpenSession()
    if (hasActiveSession) {
      throw new Errors.ConfigLockedException()
    }

    return this.boardRepo.updateConfig(id, { ...dto, updatedBy: userId })
  }
}
