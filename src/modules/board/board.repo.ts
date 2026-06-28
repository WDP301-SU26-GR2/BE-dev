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

  // ================= CÁC API KHÁC =================
  async findActiveSessionByTitle(title: string) {
    return this.prisma.boardSession.findFirst({
      where: { title, status: { in: ['UPCOMING', 'ACTIVE'] } }
    })
  }

  async findFirstOpenSession() {
    return this.prisma.boardSession.findFirst({ where: { status: 'ACTIVE' } })
  }

  async createSession(creatorId: string, dto: CreateBoardSessionBodyDto) {
    return this.prisma.boardSession.create({
      data: {
        title: dto.title,
        description: dto.description ?? null,
        creatorId: creatorId,
        status: 'UPCOMING',
        allowedEditorIds: dto.allowedEditorIds,
        startTime: dto.startTime
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
    return this.prisma.boardConfig.findFirst()
  }
}
