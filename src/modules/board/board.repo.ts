import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/infrastructure/database/prisma.service'
import {
  CreateBoardDecisionBodyDto,
  CreateBoardSessionBodyDto,
  CreateSeriesReportBodyDto,
  UpdateBoardConfigBodyDto
} from './dto/board.dto'
import { VoteDataType } from './schemas/board.model'
import { $Enums, Prisma } from '@prisma/client'
import { TERMINAL_DECISION_RESULTS } from './board.constant'

@Injectable()
export class BoardRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ================= TÌM KIẾM ĐỘC LẬP (ĐÃ BỔ SUNG) =================
  async findSessionById(id: string) {
    return this.prisma.boardSession.findUnique({ where: { id } })
  }

  async findConfigById(id: string) {
    return this.prisma.boardConfig.findUnique({ where: { id } })
  }

  async findDecisionById(id: string) {
    return this.prisma.boardDecision.findUnique({ where: { id } })
  }

  findSeriesEditorById(id: string) {
    return this.prisma.series.findUnique({
      where: { id },
      select: { id: true, editorId: true, status: true, magazine: true }
    })
  }

  async findManySessions(filter?: { participantId?: string; status?: $Enums.BoardSessionStatus }) {
    return this.prisma.boardSession.findMany({
      where: {
        ...(filter?.participantId
          ? { OR: [{ creatorId: filter.participantId }, { allowedEditorIds: { has: filter.participantId } }] }
          : {}),
        ...(filter?.status ? { status: filter.status } : {})
      },
      orderBy: { startTime: 'desc' }
    })
  }

  async findManyDecisions(filter?: { boardSessionId?: string; targetSeriesId?: string; boardSessionIds?: string[] }) {
    return this.prisma.boardDecision.findMany({
      where: {
        ...(filter?.boardSessionId ? { boardSessionId: filter.boardSessionId } : {}),
        ...(filter?.boardSessionIds ? { boardSessionId: { in: filter.boardSessionIds } } : {}),
        ...(filter?.targetSeriesId ? { targetSeriesId: filter.targetSeriesId } : {})
      },
      orderBy: { id: 'desc' }
    })
  }

  findApprovedContractDecisions(targetSeriesId: string) {
    return this.prisma.boardDecision.findMany({
      where: {
        targetSeriesId,
        decisionType: $Enums.DecisionType.CONTRACT,
        result: $Enums.BoardDecisionResult.APPROVED
      },
      orderBy: [{ decidedAt: 'desc' }, { id: 'desc' }]
    })
  }

  // §v2 point 10: id các phiên mà user nằm trong roster (allowedEditorIds) — lọc decisions ?mine=true.
  findMemberSessionIds(userId: string) {
    return this.prisma.boardSession.findMany({
      where: { allowedEditorIds: { has: userId } },
      select: { id: true }
    })
  }

  async findManyReports(filter?: { seriesId?: string; boardDecisionId?: string }) {
    return this.prisma.seriesReport.findMany({
      where: {
        ...(filter?.seriesId ? { seriesId: filter.seriesId } : {}),
        ...(filter?.boardDecisionId ? { boardDecisionId: filter.boardDecisionId } : {})
      },
      orderBy: { createdAt: 'desc' }
    })
  }

  async findReportById(id: string) {
    return this.prisma.seriesReport.findUnique({ where: { id } })
  }

  /**
   * Tìm quyết định chưa terminal (không phải APPROVED/REJECTED/EXPIRED) cho một series.
   * Dùng cho gate C1: chặn tạo decision mới khi đã có pending.
   *
   * Sử dụng `notIn` thay vì `in` để match cả null/absent (Prisma MongoDB).
   */
  async findOpenDecisionBySeries(targetSeriesId: string) {
    return this.prisma.boardDecision.findFirst({
      where: {
        targetSeriesId,
        result: { notIn: ['APPROVED', 'REJECTED', 'EXPIRED'] }
      }
    })
  }

  /**
   * Tìm báo cáo theo boardDecisionId.
   * Dùng cho gate C4: báo cáo trùng quyết định.
   */
  async findReportByDecisionId(boardDecisionId: string) {
    return this.prisma.seriesReport.findMany({
      where: { boardDecisionId },
      orderBy: { createdAt: 'desc' }
    })
  }

  async findExpiredUpcomingSessions() {
    return this.prisma.boardSession.findMany({
      where: {
        status: 'UPCOMING',
        startTime: {
          lte: new Date() // Nhỏ hơn hoặc bằng thời gian hiện tại
        }
      }
    })
  }

  async findExpiredActiveSessions() {
    return this.prisma.boardSession.findMany({
      where: { status: 'ACTIVE', endTime: { not: null, lt: new Date() } },
      select: { id: true, title: true }
    })
  }

  // ================= CÁC API KHÁC =================
  async findActiveSessionByTitle(title: string) {
    return this.prisma.boardSession.findFirst({
      where: { title, status: { in: ['UPCOMING', 'ACTIVE'] } }
    })
  }

  async findFirstOpenSession() {
    return this.prisma.boardSession.findFirst({ where: { status: 'ACTIVE' } })
  }

  async createSession(creatorId: string, dto: CreateBoardSessionBodyDto, allowedEditorIds: string[]) {
    return this.prisma.boardSession.create({
      data: {
        title: dto.title,
        description: dto.description ?? null,
        creatorId: creatorId,
        status: 'UPCOMING',
        allowedEditorIds,
        startTime: dto.startTime,
        endTime: dto.endTime ?? null
      }
    })
  }

  async updateSessionStatus(id: string, status: $Enums.BoardSessionStatus) {
    return this.prisma.boardSession.update({
      where: { id },
      data: { status }
    })
  }

  async updateSessionStatusByAuto(id: string, status: $Enums.BoardSessionStatus) {
    return this.prisma.boardSession.update({
      where: { id },
      data: { status }
    })
  }

  async createDecision(dto: CreateBoardDecisionBodyDto) {
    return this.prisma.boardDecision.create({
      data: {
        boardSessionId: dto.boardSessionId,
        targetSeriesId: dto.targetSeriesId ?? null,
        transferRequestId: dto.transferRequestId ?? null,
        decisionType: dto.decisionType,
        details: dto.details ?? null,
        result: 'PENDING',
        approveCount: 0,
        rejectCount: 0,
        totalVotes: 0,
        quorumMet: false,
        votes: []
      }
    })
  }

  /**
   * O-1 — chèn phiếu bằng MỘT lệnh ghi có điều kiện. Bộ lọc `votes: { none: { voterId } }` khiến
   * hai request của cùng một thành viên về đồng thời chỉ có đúng một cái khớp document, nên không
   * còn cảnh cả hai cùng qua bước "đọc rồi kiểm" rồi cùng đẩy phiếu vào `votes[]`.
   * Trả `null` khi thua cuộc đua để service ném `VoterAlreadyVoted`.
   */
  async pushVoteIfNotVoted(decisionId: string, vote: VoteDataType) {
    const { count } = await this.prisma.boardDecision.updateMany({
      where: { id: decisionId, votes: { none: { voterId: vote.voterId } } },
      data: { votes: { push: vote } }
    })
    if (count === 0) return null
    return this.findDecisionById(decisionId)
  }

  async updateDecisionCounters(decisionId: string, data: Prisma.BoardDecisionUpdateInput) {
    return this.prisma.boardDecision.update({
      where: { id: decisionId },
      data
    })
  }

  /**
   * O-2 — chỉ chốt khi quyết định CHƯA terminal. Trả về số document thực sự đổi: `0` nghĩa là một
   * request khác đã chốt trước, khi đó bên thua tuyệt đối không được emit `BoardDecisionFinalized`
   * (nếu không, listener series sẽ chạy hai lượt cho cùng một quyết định).
   */
  async finalizeDecisionCountersIfNotTerminal(
    decisionId: string,
    data: Prisma.BoardDecisionUpdateManyMutationInput
  ): Promise<number> {
    const { count } = await this.prisma.boardDecision.updateMany({
      where: { id: decisionId, result: { notIn: TERMINAL_DECISION_RESULTS } },
      data
    })
    return count
  }

  async findNonTerminalDecisionsBySession(sessionId: string) {
    return this.prisma.boardDecision.findMany({
      where: {
        boardSessionId: sessionId,
        OR: [{ result: null }, { result: { in: ['PENDING', 'PENDING_QUORUM'] } }]
      },
      select: { id: true, result: true }
    })
  }

  async createSeriesReport(data: CreateSeriesReportBodyDto & { preparedBy: string }) {
    return this.prisma.seriesReport.create({
      data: {
        seriesId: data.seriesId,
        boardDecisionId: data.boardDecisionId,
        preparedBy: data.preparedBy,
        reportType: data.reportType,
        content: data.content,
        attachments: data.attachments ?? []
      }
    })
  }

  async updateConfig(id: string, data: UpdateBoardConfigBodyDto & { updatedBy: string }) {
    return this.prisma.boardConfig.update({
      where: { id },
      data: {
        boardTotalMembers: data.boardTotalMembers,
        quorumMin: data.quorumMin,
        approveMajorityRatio: data.approveMajorityRatio,
        updatedBy: data.updatedBy,
        updatedAt: new Date()
      }
    })
  }

  async getActiveConfig() {
    const existing = await this.prisma.boardConfig.findFirst()
    if (existing) return existing

    return this.prisma.boardConfig.create({
      data: {
        boardTotalMembers: 5,
        quorumMin: 3,
        approveMajorityRatio: 0.5,
        isDefault: true
      }
    })
  }

  // ================= AUTO-ASSIGN ROSTER (Spec 12 / PB-05) =================
  findSeriesGenres(seriesId: string) {
    return this.prisma.series.findFirst({ where: { id: seriesId }, select: { id: true, genres: true } })
  }

  async findRoleIdByCode(code: string) {
    const role = await this.prisma.role.findUnique({ where: { code } })
    return role?.id ?? null
  }

  // Ứng viên roster: BOARD_MEMBER đang ACTIVE, chưa xoá mềm (gotcha §10: isSet:false).
  findActiveBoardMembers(roleId: string) {
    return this.prisma.user.findMany({
      where: { roleId, status: 'ACTIVE', deletedAt: { isSet: false } },
      select: {
        id: true,
        displayName: true,
        avatar: true,
        createdAt: true,
        staffProfile: { select: { specialtyGenres: true } }
      }
    })
  }

  // ================= SPEC 16 — MEETING ROOM =================
  async updateSessionPhase(id: string, phase: $Enums.BoardSessionPhase) {
    return this.prisma.boardSession.update({ where: { id }, data: { phase } })
  }

  async createBoardMessage(data: {
    sessionId: string
    senderId: string
    content: string
    phase: $Enums.BoardSessionPhase
  }) {
    return this.prisma.boardMessage.create({ data })
  }

  async findMessagesBySession(sessionId: string, page: { limit: number; offset: number }) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.boardMessage.findMany({
        where: { sessionId },
        orderBy: { createdAt: 'asc' },
        skip: page.offset,
        take: page.limit
      }),
      this.prisma.boardMessage.count({ where: { sessionId } })
    ])
    return { items, total }
  }

  // Batch resolve tên hiển thị (Spec 16 embed names) — 1 query, không N+1.
  findUsersMiniByIds(ids: string[]) {
    if (ids.length === 0) return Promise.resolve([])
    return this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, displayName: true, avatar: true }
    })
  }

  findSeriesTitlesByIds(ids: string[]) {
    if (ids.length === 0) return Promise.resolve([])
    return this.prisma.series.findMany({ where: { id: { in: ids } }, select: { id: true, title: true } })
  }
}
