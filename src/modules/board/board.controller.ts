import { Controller, Get, Post, Body, Param, Patch } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { BoardService } from './services/board.service'
import {
  CreateBoardDecisionBodyDto,
  CastVoteBodyDto,
  CreateSeriesReportBodyDto,
  UpdateBoardConfigBodyDto,
  CreateBoardSessionBodyDto,
  BoardSessionResDto,
  BoardDecisionResDto,
  BoardVoteResDto,
  SeriesReportResDto,
  BoardConfigResDto
} from './dto/board.dto'
import { RoleName } from 'src/core/security/constants/role.constant'
import { Roles } from 'src/core/security/decorators/roles.decorator'
import { ActiveUser } from 'src/core/security/decorators/active-user.decorator'
import { MessageResDto } from 'src/core/http/dto/response.dto'

@ApiTags('board')
@ApiBearerAuth()
@Controller('board')
export class BoardController {
  constructor(private readonly boardService: BoardService) {}

  @ApiOperation({ summary: 'Editor tạo phiên họp Hội đồng → SCHEDULED' })
  @Post('sessions')
  @Roles(RoleName.EDITOR, RoleName.SUPER_ADMIN)
  @ZodResponse({ status: 201, type: BoardSessionResDto })
  createSession(@ActiveUser('userId') creatorId: string, @Body() dto: CreateBoardSessionBodyDto) {
    return this.boardService.createSession(creatorId, dto)
  }

  @ApiOperation({ summary: 'Danh sách phiên họp Hội đồng' })
  @Get('sessions')
  @Roles(RoleName.EDITOR, RoleName.SUPER_ADMIN, RoleName.BOARD_MEMBER)
  @ZodResponse({ status: 200, type: [BoardSessionResDto] })
  getSessions() {
    return this.boardService.getSessions()
  }

  @ApiOperation({ summary: 'Chi tiết phiên họp Hội đồng' })
  @Get('sessions/:id')
  @Roles(RoleName.EDITOR, RoleName.SUPER_ADMIN, RoleName.BOARD_MEMBER)
  @ZodResponse({ status: 200, type: BoardSessionResDto })
  getSessionById(@Param('id') id: string) {
    return this.boardService.getSessionById(id)
  }

  @ApiOperation({ summary: 'Kích hoạt phiên họp Hội đồng → ACTIVE' })
  @Patch('sessions/:id/start')
  @Roles(RoleName.EDITOR, RoleName.SUPER_ADMIN)
  @ZodResponse({ status: 200, type: BoardSessionResDto })
  async startSession(@Param('id') id: string) {
    return this.boardService.startSessionManually(id)
  }

  @ApiOperation({ summary: 'Xem cấu hình biểu quyết Hội đồng hiện tại' })
  @Get('config')
  @Roles(RoleName.SUPER_ADMIN, RoleName.BOARD_MEMBER, RoleName.EDITOR)
  @ZodResponse({ status: 200, type: BoardConfigResDto })
  getConfig() {
    return this.boardService.getConfig()
  }

  @ApiOperation({ summary: 'Editor tạo quyết định Hội đồng nháp → PENDING' })
  @Post('decisions')
  @Roles(RoleName.EDITOR, RoleName.SUPER_ADMIN)
  @ZodResponse({ status: 201, type: BoardDecisionResDto })
  createDecision(@Body() dto: CreateBoardDecisionBodyDto) {
    return this.boardService.createDecision(dto)
  }

  @ApiOperation({ summary: 'Danh sách quyết định Hội đồng' })
  @Get('decisions')
  @Roles(RoleName.EDITOR, RoleName.SUPER_ADMIN, RoleName.BOARD_MEMBER)
  @ZodResponse({ status: 200, type: [BoardDecisionResDto] })
  getDecisions() {
    return this.boardService.getDecisions()
  }

  @ApiOperation({ summary: 'Chi tiết quyết định Hội đồng' })
  @Get('decisions/:id')
  @Roles(RoleName.EDITOR, RoleName.SUPER_ADMIN, RoleName.BOARD_MEMBER)
  @ZodResponse({ status: 200, type: BoardDecisionResDto })
  getDecisionDetails(@Param('id') id: string) {
    return this.boardService.getDecisionDetails(id)
  }

  @ApiOperation({ summary: 'Danh sách phiếu biểu quyết của quyết định' })
  @Get('decisions/:id/votes')
  @Roles(RoleName.EDITOR, RoleName.SUPER_ADMIN, RoleName.BOARD_MEMBER)
  @ZodResponse({ status: 200, type: [BoardVoteResDto] })
  getDecisionVotes(@Param('id') id: string) {
    return this.boardService.getDecisionVotes(id)
  }

  @ApiOperation({ summary: 'Board/Editor bỏ phiếu cho quyết định → cập nhật kết quả' })
  @Post('decisions/:id/vote')
  @Roles(RoleName.BOARD_MEMBER, RoleName.EDITOR)
  @ZodResponse({ status: 201, type: MessageResDto })
  castVote(@Param('id') decisionId: string, @ActiveUser('userId') voterId: string, @Body() dto: CastVoteBodyDto) {
    return this.boardService.castVote(decisionId, voterId, dto)
  }

  @ApiOperation({ summary: 'Danh sách báo cáo Hội đồng' })
  @Get('reports')
  @Roles(RoleName.EDITOR, RoleName.SUPER_ADMIN, RoleName.BOARD_MEMBER)
  @ZodResponse({ status: 200, type: [SeriesReportResDto] })
  getReports() {
    return this.boardService.getReports()
  }

  @ApiOperation({ summary: 'Chi tiết báo cáo Hội đồng' })
  @Get('reports/:id')
  @Roles(RoleName.EDITOR, RoleName.SUPER_ADMIN, RoleName.BOARD_MEMBER)
  @ZodResponse({ status: 200, type: SeriesReportResDto })
  getReportById(@Param('id') id: string) {
    return this.boardService.getReportById(id)
  }

  @ApiOperation({ summary: 'Editor tạo báo cáo phân tích series cho Hội đồng' })
  @Post('reports')
  @Roles(RoleName.EDITOR)
  @ZodResponse({ status: 201, type: SeriesReportResDto })
  createSeriesReport(@ActiveUser('userId') userId: string, @Body() dto: CreateSeriesReportBodyDto) {
    return this.boardService.createSeriesReport(userId, dto)
  }

  @ApiOperation({ summary: 'Super Admin cập nhật cấu hình biểu quyết Hội đồng' })
  @Patch('config/:id')
  @Roles(RoleName.SUPER_ADMIN)
  @ZodResponse({ status: 200, type: BoardConfigResDto })
  updateConfig(@Param('id') id: string, @ActiveUser('userId') userId: string, @Body() dto: UpdateBoardConfigBodyDto) {
    return this.boardService.updateConfig(id, userId, dto)
  }
}
