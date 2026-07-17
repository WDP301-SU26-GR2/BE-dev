import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/infrastructure/database/prisma.service'
import {
  CreateBoardDecisionBodyDto,
  CreateBoardSessionBodyDto,
  CreateSeriesReportBodyDto,
  UpdateBoardConfigBodyDto
} from './dto/board.dto'
import { BoardDecisionDataType, VoteDataType } from './schemas/board.model'
import { $Enums } from '@prisma/client'

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

  async findManyDecisions(filter?: { boardSessionId?: string; targetSeriesId?: string }) {
    return this.prisma.boardDecision.findMany({
      where: {
        ...(filter?.boardSessionId ? { boardSessionId: filter.boardSessionId } : {}),
        ...(filter?.targetSeriesId ? { targetSeriesId: filter.targetSeriesId } : {})
      },
      orderBy: { id: 'desc' }
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

  async pushVoteToDecision(decisionId: string, vote: VoteDataType) {
    return this.prisma.boardDecision.update({
      where: { id: decisionId },
      data: { votes: { push: vote } }
    })
  }

  async updateDecisionCounters(decisionId: string, data: any): Promise<BoardDecisionDataType> {
    return this.prisma.boardDecision.update({
      where: { id: decisionId },
      data
    }) as unknown as Promise<BoardDecisionDataType>
    // Dùng cấu trúc này một lần duy nhất tại Repo để ép kiểu thô từ Prisma về Model của bạn
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
