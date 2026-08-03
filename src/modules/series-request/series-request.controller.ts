import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { ApiErrors } from 'src/core/http/decorators/api-errors.decorator'
import { RoleName } from 'src/core/security/constants/role.constant'
import { ActiveUser } from 'src/core/security/decorators/active-user.decorator'
import { Roles } from 'src/core/security/decorators/roles.decorator'
import type { JwtAccessTokenPayload } from 'src/infrastructure/token/jwt.type'
import {
  AcceptSeriesRequestBodyDto,
  CreateSeriesRequestBodyDto,
  ListSeriesRequestQueryDto,
  RejectSeriesRequestBodyDto,
  SeriesRequestListResDto,
  SeriesRequestResDto
} from './dto/series-request.dto'
import {
  InvalidSeriesRequestTransitionException,
  OpenSeriesRequestExistsException,
  SeriesRequestAccessDeniedException,
  SeriesRequestNotAllowedException,
  SeriesRequestNotFoundException
} from './errors/series-request.errors'
import { SeriesRequestService } from './series-request.service'

@ApiTags('series-requests')
@ApiBearerAuth()
@Controller('series-requests')
export class SeriesRequestController {
  constructor(private readonly seriesRequestService: SeriesRequestService) {}

  @Post()
  @ApiOperation({ summary: 'Tác giả gửi yêu cầu rút hồ sơ / tạm ngưng / kết thúc sớm → PENDING' })
  @ApiErrors(
    SeriesRequestNotFoundException,
    SeriesRequestAccessDeniedException,
    SeriesRequestNotAllowedException,
    OpenSeriesRequestExistsException
  )
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 201, type: SeriesRequestResDto })
  create(@Body() body: CreateSeriesRequestBodyDto, @ActiveUser('userId') userId: string) {
    return this.seriesRequestService.create(userId, body)
  }

  @Get()
  @ApiOperation({ summary: 'Danh sách yêu cầu theo phạm vi của người gọi' })
  @Roles(RoleName.MANGAKA, RoleName.EDITOR, RoleName.BOARD_MEMBER, RoleName.SUPER_ADMIN)
  @ZodResponse({ status: 200, type: SeriesRequestListResDto })
  list(@ActiveUser() user: JwtAccessTokenPayload, @Query() query: ListSeriesRequestQueryDto) {
    return this.seriesRequestService.list({ userId: user.userId, roleName: user.roleName }, query)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết một yêu cầu' })
  @ApiErrors(SeriesRequestNotFoundException, SeriesRequestAccessDeniedException)
  @Roles(RoleName.MANGAKA, RoleName.EDITOR, RoleName.BOARD_MEMBER, RoleName.SUPER_ADMIN)
  @ZodResponse({ status: 200, type: SeriesRequestResDto })
  getById(@Param('id') id: string, @ActiveUser() user: JwtAccessTokenPayload) {
    return this.seriesRequestService.getById({ userId: user.userId, roleName: user.roleName }, id)
  }

  @Post(':id/accept')
  @ApiOperation({
    summary:
      'Biên tập viên chấp nhận yêu cầu. WITHDRAW → rút hồ sơ ngay; HIATUS → tạm ngưng ngay; COMPLETION → chỉ ghi nhận, cần trình Hội đồng'
  })
  @ApiErrors(
    SeriesRequestNotFoundException,
    SeriesRequestAccessDeniedException,
    SeriesRequestNotAllowedException,
    InvalidSeriesRequestTransitionException
  )
  @Roles(RoleName.EDITOR)
  @ZodResponse({ status: 201, type: SeriesRequestResDto })
  accept(@Param('id') id: string, @Body() body: AcceptSeriesRequestBodyDto, @ActiveUser('userId') userId: string) {
    return this.seriesRequestService.accept(userId, id, body)
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Biên tập viên từ chối yêu cầu (bắt buộc nêu lý do); bộ truyện giữ nguyên trạng thái' })
  @ApiErrors(
    SeriesRequestNotFoundException,
    SeriesRequestAccessDeniedException,
    InvalidSeriesRequestTransitionException
  )
  @Roles(RoleName.EDITOR)
  @ZodResponse({ status: 201, type: SeriesRequestResDto })
  reject(@Param('id') id: string, @Body() body: RejectSeriesRequestBodyDto, @ActiveUser('userId') userId: string) {
    return this.seriesRequestService.reject(userId, id, body)
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Tác giả tự huỷ yêu cầu đang chờ' })
  @ApiErrors(
    SeriesRequestNotFoundException,
    SeriesRequestAccessDeniedException,
    InvalidSeriesRequestTransitionException
  )
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 201, type: SeriesRequestResDto })
  cancel(@Param('id') id: string, @ActiveUser('userId') userId: string) {
    return this.seriesRequestService.cancel(userId, id)
  }
}
