import { Injectable, Logger } from '@nestjs/common'
import { BoardRepository } from '../board.repo'
import * as Errors from '../errors/board.errors'
import { BoardMessages } from '../board.messages'
import {
  CreateBoardDecisionBodyDto,
  CastVoteBodyDto,
  CreateSeriesReportBodyDto,
  UpdateBoardConfigBodyDto,
  CreateBoardSessionBodyDto,
  BoardDecisionResDto,
  BoardVoteResDto
} from '../dto/board.dto'
import { BoardGateway } from '../board.gateway'
import { $Enums, AuditEntityType, NotificationType } from '@prisma/client'
import { BoardDecisionDataType } from '../schemas/board.model'
import { NotificationService } from 'src/modules/notification/notification.service'
import { DomainEvent, DomainEventPayload } from 'src/core/events/domain-events'
import { DomainEventBus } from 'src/core/events/domain-event-bus.service'
import { AuditService } from 'src/modules/audit/audit.service'
import { BoardSessionStateService } from './board-session-state.service'

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/

@Injectable()
export class BoardService {
  private readonly logger = new Logger(BoardService.name)

  constructor(
    private readonly boardRepo: BoardRepository,
    private readonly boardGateway: BoardGateway,
    private readonly notificationService: NotificationService,
    private readonly eventBus: DomainEventBus,
    private readonly auditService: AuditService,
    private readonly boardSessionStateService: BoardSessionStateService
  ) {}

  /**
   * 1. Tạo Session
   * Spec 7 / B-BRD-05: sĩ số đại biểu bắt buộc lẻ (loại trừ hòa phiếu).
   */
  async createSession(creatorId: string, dto: CreateBoardSessionBodyDto) {
    // B-BRD-05: validate odd-size roster up-front (defense in depth — BoardConfig PATCH đã enforce qua zod superRefine,
    // nhưng createSession là entry khác nên check ở đây để khóa cứng).
    if (dto.allowedEditorIds.length === 0 || dto.allowedEditorIds.length % 2 === 0) {
      throw Errors.InvalidBoardMembersException
    }
    const isSessionExist = await this.boardRepo.findActiveSessionByTitle(dto.title)
    if (isSessionExist) {
      throw Errors.SessionAlreadyExistsException
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
          content: BoardMessages.notification.sessionCreated(dto.title)
        })
      )
    )

    return createdSession
  }

  async startSessionManually(sessionId: string) {
    if (!OBJECT_ID_RE.test(sessionId)) throw Errors.SessionNotFoundException
    // BoardSessionStateService enforces the UPCOMING → ACTIVE transition (and throws
    // InvalidBoardSessionTransitionException / SessionNotFoundException otherwise).
    return this.boardSessionStateService.transition(sessionId, $Enums.BoardSessionStatus.ACTIVE, null)
  }

  /**
   * 2. Lấy cấu hình điều lệ hiện tại
   */
  async getConfig() {
    const config = await this.boardRepo.getActiveConfig()
    if (!config) {
      throw Errors.BoardConfigNotFoundException
    }
    return config
  }

  /**
   * 3. Khởi tạo một Quyết định mới
   * 🛡️ RÀO CHẮN: Chặn đứng việc gán Quyết định vào một Session không tồn tại
   */
  async createDecision(dto: CreateBoardDecisionBodyDto) {
    const session = await this.boardRepo.findSessionById(dto.boardSessionId)
    if (!session) throw Errors.SessionNotFoundException
    // B-BRD-05 (defense-in-depth): chặn decision gắn vào session có roster chẵn (session có thể tạo/sửa bằng đường khác).
    if (session.allowedEditorIds.length % 2 === 0) {
      throw Errors.InvalidBoardMembersException
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
          content: BoardMessages.notification.decisionCreated
        })
      )
    )

    return decision as unknown as BoardDecisionResDto
  }

  async getSessions() {
    return this.boardRepo.findManySessions()
  }

  async getSessionById(sessionId: string) {
    if (!OBJECT_ID_RE.test(sessionId)) throw Errors.SessionNotFoundException
    const session = await this.boardRepo.findSessionById(sessionId)
    if (!session) throw Errors.SessionNotFoundException
    return session
  }

  async getDecisions() {
    return (await this.boardRepo.findManyDecisions()) as unknown as BoardDecisionResDto[]
  }

  async getDecisionDetails(decisionId: string) {
    if (!OBJECT_ID_RE.test(decisionId)) throw Errors.DecisionNotFoundException
    const decision = await this.boardRepo.findDecisionById(decisionId)
    if (!decision) throw Errors.DecisionNotFoundException
    return decision as unknown as BoardDecisionResDto
  }

  async getDecisionVotes(decisionId: string) {
    if (!OBJECT_ID_RE.test(decisionId)) throw Errors.DecisionNotFoundException
    const decision = await this.boardRepo.findDecisionById(decisionId)
    if (!decision) throw Errors.DecisionNotFoundException
    return (decision.votes ?? []) as unknown as BoardVoteResDto[]
  }

  async getReports() {
    return this.boardRepo.findManyReports()
  }

  async getReportById(reportId: string) {
    if (!OBJECT_ID_RE.test(reportId)) throw Errors.ReportNotFoundException
    const report = await this.boardRepo.findReportById(reportId)
    if (!report) throw Errors.ReportNotFoundException
    return report
  }

  /**
   * 4. Đại biểu thực hiện bỏ phiếu
   * 🛡️ RÀO CHẮN: Kiểm soát chặt chẽ, ghi DB xong -> phát Realtime lập tức
   */
  async castVote(decisionId: string, voterId: string, dto: CastVoteBodyDto) {
    if (!OBJECT_ID_RE.test(decisionId)) throw Errors.DecisionNotFoundException
    // Bước 1: Kiểm tra Quyết định có tồn tại thật không
    const decision = await this.boardRepo.findDecisionById(decisionId)
    if (!decision) throw Errors.DecisionNotFoundException

    // Bước 2: Kiểm tra Phiên họp tổng đính kèm có tồn tại thật không
    const session = await this.boardRepo.findSessionById(decision.boardSessionId)
    if (!session) throw Errors.SessionNotFoundException

    // Bước 3: Kiểm tra trạng thái phiên họp (Bắt buộc ACTIVE)
    if (session.status !== 'ACTIVE') {
      throw Errors.SessionNotOpenException
    }

    // Bước 4: Kiểm tra quyền danh sách đại biểu
    const isAllowed = session.allowedEditorIds.includes(voterId)
    if (!isAllowed) throw Errors.VoterNotAllowedException

    // Bước 5: Chặn Double-voting
    const hasVoted = decision.votes.some((vote) => vote.voterId === voterId)
    if (hasVoted) throw Errors.VoterAlreadyVotedException

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

    return { message: BoardMessages.response.voteCast }
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

    // Đọc trạng thái TRƯỚC update để chống re-emit: chỉ phát event khi flip non-terminal → terminal.
    const before = await this.boardRepo.findDecisionById(decisionId)
    const wasTerminal = before?.result === 'APPROVED' || before?.result === 'REJECTED'

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

    // Spec 2 / Flow 5: emit BoardDecisionFinalized khi kết quả LẦN ĐẦU đạt terminal (best-effort).
    // Guard `!wasTerminal` chống re-emit khi có phiếu đến sau lúc đã chốt (Spec 1 §10). Series listener
    // reacts to drive lifecycle transitions (CANCELLATION/COMPLETION/FORMAT_CHANGE/SERIALIZATION outcomes).
    if ((result === 'APPROVED' || result === 'REJECTED') && !wasTerminal && before) {
      try {
        const payload: DomainEventPayload[typeof DomainEvent.BoardDecisionFinalized] = {
          decisionId: before.id,
          decisionType:
            (before.decisionType as DomainEventPayload[typeof DomainEvent.BoardDecisionFinalized]['decisionType']) ??
            '',
          targetSeriesId: before.targetSeriesId ?? null,
          result: result,
          details: (before.details as Record<string, unknown> | null) ?? null
        }
        this.eventBus.emit(DomainEvent.BoardDecisionFinalized, payload)
      } catch (e) {
        this.logger.warn(`Failed to emit BoardDecisionFinalized for ${decisionId}: ${(e as Error).message}`)
      }
      try {
        await this.auditService.record({
          actorId: null,
          entityType: AuditEntityType.BOARD_DECISION,
          entityId: before.id,
          action: 'DECISION_FINALIZED',
          fromState: before.result ?? 'PENDING',
          toState: result
        })
      } catch (e) {
        this.logger.warn(`Failed to audit DECISION_FINALIZED for ${decisionId}: ${(e as Error).message}`)
      }
    }

    // 🌟 ÉP KIỂU ĐẦU RA AN TOÀN: Triệt tiêu hoàn toàn lỗi ESLint no-unsafe-return
    return updatedDecision
  }

  /**
   * 6. Tạo báo cáo số liệu xu hướng
   * 🛡️ RÀO CHẮN: Giải quyết dứt điểm lỗi crash bạn vừa gặp bằng kỹ thuật tách query
   */
  async createSeriesReport(userId: string, dto: CreateSeriesReportBodyDto) {
    if (!OBJECT_ID_RE.test(dto.boardDecisionId)) throw Errors.DecisionNotFoundException
    // Bước 1: Kiểm tra Quyết định tồn tại
    const decision = await this.boardRepo.findDecisionById(dto.boardDecisionId)
    if (!decision) {
      throw Errors.DecisionNotFoundException
    }

    // Bước 2: Kiểm tra Phiên họp tổng tồn tại dựa trên id bóc từ bản ghi decision
    const session = await this.boardRepo.findSessionById(decision.boardSessionId)
    if (!session) {
      throw Errors.SessionNotFoundException
    }

    // Bước 3: Kiểm tra trạng thái bế mạc
    if (session.status === 'CONCLUDED') {
      throw Errors.SessionClosedReportException
    }

    // Bước 4: Kiểm tra phân quyền Editor có tên trong danh sách mời họp hay không
    const isInvited = session.allowedEditorIds.includes(userId)
    if (!isInvited) {
      throw Errors.EditorNotInvitedException
    }

    return this.boardRepo.createSeriesReport({ ...dto, preparedBy: userId })
  }

  /**
   * 7. Cập nhật cấu hình điều lệ Hội đồng
   * 🛡️ RÀO CHẮN: Chặn đứng trường hợp client gửi bừa một configId sai lệch lên URL
   */
  async updateConfig(id: string, userId: string, dto: UpdateBoardConfigBodyDto) {
    if (!OBJECT_ID_RE.test(id)) throw Errors.BoardConfigNotFoundException
    // Bước 1: Xác thực configId có thực sự tồn tại trong DB không
    const config = await this.boardRepo.findConfigById(id)
    if (!config) {
      throw Errors.BoardConfigNotFoundException
    }

    // Bước 2: Kiểm tra xem có phiên họp nào đang OPEN dở dang không
    const hasActiveSession = await this.boardRepo.findFirstOpenSession()
    if (hasActiveSession) {
      throw Errors.ConfigLockedException
    }

    return this.boardRepo.updateConfig(id, { ...dto, updatedBy: userId })
  }
}
