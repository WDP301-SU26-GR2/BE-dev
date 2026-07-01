import { Controller, Get, Post, Body, Param, Patch } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { BoardService } from './services/board.service'
import {
  CreateBoardDecisionBodyDto,
  CastVoteBodyDto,
  CreateSeriesReportBodyDto,
  UpdateBoardConfigBodyDto,
  CreateBoardSessionBodyDto
} from './dto/board.dto'
import { RoleName } from 'src/core/security/constants/role.constant'
import { Roles } from 'src/core/security/decorators/roles.decorator'
import { ActiveUser } from 'src/core/security/decorators/active-user.decorator'

@ApiTags('board')
@ApiBearerAuth()
@Controller('board')
export class BoardController {
  constructor(private readonly boardService: BoardService) {}

  /**
   * 1. Khởi tạo một phiên họp Hội đồng tổng mới
   */
  @ApiOperation({ summary: 'Tạo phiên họp Hội đồng mới' })
  @Post('sessions')
  @Roles(RoleName.EDITOR, RoleName.SUPER_ADMIN)
  createSession(
    @ActiveUser('userId') creatorId: string, // An toàn tuyệt đối: Trích xuất từ JWT Token
    @Body() dto: CreateBoardSessionBodyDto
  ) {
    return this.boardService.createSession(creatorId, dto)
  }

  @ApiOperation({ summary: 'Kích hoạt phiên họp Hội đồng bằng tay' })
  @Patch('sessions/:id/start')
  async startSession(@Param('id') id: string) {
    return this.boardService.startSessionManually(id)
  }

  /**
   * 2. Lấy tham số điều lệ cấu hình Hội đồng hiện tại
   */
  @ApiOperation({ summary: 'Lấy cấu hình điều lệ Hội đồng đang áp dụng' })
  @Get('config')
  @Roles(RoleName.SUPER_ADMIN, RoleName.BOARD_MEMBER, RoleName.EDITOR)
  getConfig() {
    return this.boardService.getConfig()
  }

  /**
   * 3. Khởi tạo một Quyết định họp Hội đồng biểu quyết mới (Nháp)
   */
  @ApiOperation({ summary: 'Tạo quyết định họp Hội đồng nháp' })
  @Post('decisions')
  @Roles(RoleName.EDITOR, RoleName.SUPER_ADMIN)
  createDecision(@Body() dto: CreateBoardDecisionBodyDto) {
    return this.boardService.createDecision(dto)
  }

  @ApiOperation({ summary: 'Lấy chi tiết quyết định họp' })
  @Get('decisions/:id')
  async getDecisionDetails(@Param('id') id: string) {
    return this.boardService.getDecisionDetails(id)
  }

  /**
   * 4. Đại biểu Hội đồng tiến hành thực hiện quyền bỏ phiếu
   */
  @ApiOperation({ summary: 'Đại biểu tiến hành bỏ phiếu cho quyết định' })
  @Post('decisions/:id/vote')
  @Roles(RoleName.BOARD_MEMBER, RoleName.EDITOR) // Cho phép cả hai nhóm phân quyền tham gia biểu quyết
  castVote(
    @Param('id') decisionId: string, // Lấy mã quyết định từ URL Parameter
    @ActiveUser('userId') voterId: string, // Trích xuất ID đại biểu từ Token bảo mật
    @Body() dto: CastVoteBodyDto // Nhận kết quả APPROVE/REJECT/ABSTAIN từ Body
  ) {
    return this.boardService.castVote(decisionId, voterId, dto)
  }

  /**
   * 5. Editor nộp báo cáo phân tích số liệu đính kèm phiên họp
   * 🌟 ĐÃ SỬA: Truyền phân tách rời (userId, dto) theo đúng thiết kế của tầng Service
   */
  @ApiOperation({ summary: 'Editor tạo báo cáo phân tích xu hướng cho series' })
  @Post('reports')
  @Roles(RoleName.EDITOR)
  createSeriesReport(@ActiveUser('userId') userId: string, @Body() dto: CreateSeriesReportBodyDto) {
    return this.boardService.createSeriesReport(userId, dto)
  }

  /**
   * 6. Admin thay đổi cấu trúc tham số điều lệ Hội đồng
   * 🌟 ĐÃ SỬA: Thay đổi cách gọi hàm khớp với 3 tham số độc lập (id, userId, dto)
   */
  @ApiOperation({ summary: 'Cập nhật cấu hình điều lệ Hội đồng' })
  @Patch('config/:id')
  @Roles(RoleName.SUPER_ADMIN)
  updateConfig(@Param('id') id: string, @ActiveUser('userId') userId: string, @Body() dto: UpdateBoardConfigBodyDto) {
    return this.boardService.updateConfig(id, userId, dto)
  }
}
