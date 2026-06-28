import { Controller, Get, Post, Body, Param, Patch } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { BoardService } from './services/board.service'
import {
  CreateBoardDecisionBodyDto,
  CastVoteBodyDto,
  CreateSeriesReportBodyDto,
  UpdateBoardConfigBodyDto
} from './dto/board.dto'
import { RoleName } from 'src/core/security/constants/role.constant'
import { Roles } from 'src/core/security/decorators/roles.decorator'
import { ActiveUser } from 'src/core/security/decorators/active-user.decorator'

@ApiTags('board')
@ApiBearerAuth()
@Controller('board')
export class BoardController {
  constructor(private readonly boardService: BoardService) {}

  // 1. Lấy tham số điều lệ cấu hình Hội đồng hiện tại
  @Get('config')
  @Roles(RoleName.SUPER_ADMIN, RoleName.BOARD_MEMBER, RoleName.EDITOR)
  getConfig() {
    return this.boardService.getConfig()
  }

  // 2. Khởi tạo một Quyết định họp Hội đồng biểu quyết mới (Nháp)
  @Post('decisions')
  @Roles(RoleName.EDITOR, RoleName.SUPER_ADMIN)
  createDecision(@Body() dto: CreateBoardDecisionBodyDto) {
    return this.boardService.createDecision(dto)
  }

  // 3. Đại biểu Hội đồng tiến hành thực hiện quyền bỏ phiếu
  @Post('decisions/:id/vote')
  @Roles(RoleName.BOARD_MEMBER)
  castVote(
    @Param('id') id: string,
    @ActiveUser('userId') userId: string, // Lấy trực tiếp ID người dùng từ token để làm voterId nhằm bảo mật
    @Body() dto: CastVoteBodyDto
  ) {
    return this.boardService.castVote(id, { ...dto, voterId: userId })
  }

  // 4. Editor nộp báo cáo phân tích số liệu đính kèm phiên họp
  @Post('reports')
  @Roles(RoleName.EDITOR)
  createSeriesReport(
    @ActiveUser('userId') userId: string, // Tự động lấy userId làm người chuẩn bị báo cáo (preparedBy)
    @Body() dto: CreateSeriesReportBodyDto
  ) {
    return this.boardService.createSeriesReport({ ...dto, preparedBy: userId })
  }

  // 5. Admin thay đổi cấu trúc tham số điều lệ Hội đồng
  @Patch('config/:id')
  @Roles(RoleName.SUPER_ADMIN)
  updateConfig(
    @Param('id') id: string,
    @ActiveUser('userId') userId: string, // Lưu vết ai là người cập nhật cấu hình (updatedBy)
    @Body() dto: UpdateBoardConfigBodyDto
  ) {
    return this.boardService.updateConfig(id, { ...dto, updatedBy: userId })
  }
}
