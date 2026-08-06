import { Injectable } from '@nestjs/common'
import { isObjectId } from 'src/core/http/schemas/object-id.schema'
import { BoardRepository } from '../board.repo'
import { CreateSeriesReportBodyDto, UpdateBoardConfigBodyDto } from '../dto/board.dto'
import * as Errors from '../errors/board.errors'

@Injectable()
export class BoardGovernanceService {
  constructor(private readonly boardRepo: BoardRepository) {}

  async createSeriesReport(userId: string, dto: CreateSeriesReportBodyDto) {
    if (!isObjectId(dto.boardDecisionId)) throw Errors.DecisionNotFoundException
    const decision = await this.boardRepo.findDecisionById(dto.boardDecisionId)
    if (!decision) throw Errors.DecisionNotFoundException
    if (!decision.targetSeriesId || decision.targetSeriesId !== dto.seriesId) {
      throw Errors.ReportDecisionSeriesMismatchException
    }
    const session = await this.boardRepo.findSessionById(decision.boardSessionId)
    if (!session) throw Errors.SessionNotFoundException
    if (session.status === 'CONCLUDED') throw Errors.SessionClosedReportException

    // C4: mỗi quyết định chỉ có MỘT báo cáo (SeriesReport.boardDecisionId @unique).
    // Tiền kiểm để trả lỗi đẹp; @unique vẫn là hàng rào thật chống race.
    const existingReports = await this.boardRepo.findReportByDecisionId(dto.boardDecisionId)
    if (existingReports.length > 0) {
      throw Errors.BoardReportAlreadyExistsException
    }

    const series = await this.boardRepo.findSeriesEditorById(dto.seriesId)
    if (!series) throw Errors.SeriesNotFoundException
    if (series.editorId !== userId) throw Errors.EditorNotAssignedToSeriesException
    return this.boardRepo.createSeriesReport({ ...dto, preparedBy: userId })
  }

  async updateConfig(id: string, userId: string, dto: UpdateBoardConfigBodyDto) {
    if (!isObjectId(id)) throw Errors.BoardConfigNotFoundException
    if (!(await this.boardRepo.findConfigById(id))) throw Errors.BoardConfigNotFoundException
    if (await this.boardRepo.findFirstOpenSession()) throw Errors.ConfigLockedException
    return this.boardRepo.updateConfig(id, { ...dto, updatedBy: userId })
  }
}
