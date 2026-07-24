import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { ApiErrors } from 'src/core/http/decorators/api-errors.decorator'
import { MessageResDto } from 'src/core/http/dto/response.dto'
import { RoleName } from 'src/core/security/constants/role.constant'
import { ActiveUser } from 'src/core/security/decorators/active-user.decorator'
import { Roles } from 'src/core/security/decorators/roles.decorator'
import type { JwtAccessTokenPayload } from 'src/infrastructure/token/jwt.type'
import {
  ConfirmStageOutputsBodyDto,
  CreateStageBodyDto,
  ProductionStageResDto,
  StageListResDto,
  StagePageListResDto,
  UpdateStageBodyDto
} from './dto/production-stage.dto'
import {
  ProductionNotFinalizedException,
  StageAccessDeniedException,
  StageHasOpenTasksException,
  StageNotActiveException,
  StageNotDeletableException,
  StageNotEditableException,
  StageNotFoundException,
  StageOutputInvalidException,
  StageOutputNotReadyException,
  StagePageNotFoundException
} from './errors/production-stage.errors'
import { ProductionStageService } from './services/production-stage.service'
import { ProductionStagePageService } from './services/production-stage-page.service'

@ApiTags('Production Stages')
@ApiBearerAuth()
@Controller()
export class ProductionStageController {
  constructor(
    private readonly service: ProductionStageService,
    private readonly pageService: ProductionStagePageService
  ) {}

  @Get('chapters/:id/stages')
  @Roles(RoleName.MANGAKA, RoleName.EDITOR, RoleName.BOARD_MEMBER, RoleName.SUPER_ADMIN)
  @ApiOperation({ summary: 'Danh sách giai đoạn sản xuất của chapter và analytics' })
  @ApiErrors(StageAccessDeniedException)
  @ZodResponse({ status: 200, type: StageListResDto })
  list(@ActiveUser() user: JwtAccessTokenPayload, @Param('id') id: string) {
    return this.service.list(user, id)
  }

  @Post('chapters/:id/stages/:stageId/complete')
  @Roles(RoleName.MANGAKA)
  @ApiOperation({ summary: 'Hoàn thành stage ACTIVE và mở stage kế tiếp' })
  @ApiErrors(
    StageAccessDeniedException,
    StageNotFoundException,
    StageNotActiveException,
    StageHasOpenTasksException,
    StageOutputNotReadyException
  )
  @ZodResponse({ status: 201, type: MessageResDto })
  complete(@ActiveUser() user: JwtAccessTokenPayload, @Param('id') id: string, @Param('stageId') stageId: string) {
    return this.service.complete(user, id, stageId)
  }

  @Patch('chapters/:id/stages/:stageId')
  @Roles(RoleName.MANGAKA)
  @ApiOperation({ summary: 'Sửa tên hoặc deadline stage chưa hoàn thành' })
  @ApiErrors(StageAccessDeniedException, StageNotFoundException, StageNotEditableException)
  @ZodResponse({ status: 200, type: ProductionStageResDto })
  patch(
    @ActiveUser() user: JwtAccessTokenPayload,
    @Param('id') id: string,
    @Param('stageId') stageId: string,
    @Body() body: UpdateStageBodyDto
  ) {
    return this.service.patch(user, id, stageId, body)
  }

  @Post('chapters/:id/stages')
  @Roles(RoleName.MANGAKA)
  @ApiOperation({ summary: 'Chèn custom stage trong vùng chưa mở' })
  @ApiErrors(StageAccessDeniedException, StageNotFoundException, StageNotDeletableException)
  @ZodResponse({ status: 201, type: ProductionStageResDto })
  add(@ActiveUser() user: JwtAccessTokenPayload, @Param('id') id: string, @Body() body: CreateStageBodyDto) {
    return this.service.add(user, id, body)
  }

  @Delete('chapters/:id/stages/:stageId')
  @Roles(RoleName.MANGAKA)
  @ApiOperation({ summary: 'Xoá stage LOCKED chưa có task' })
  @ApiErrors(StageAccessDeniedException, StageNotFoundException, StageNotDeletableException)
  @ZodResponse({ status: 200, type: MessageResDto })
  remove(@ActiveUser() user: JwtAccessTokenPayload, @Param('id') id: string, @Param('stageId') stageId: string) {
    return this.service.remove(user, id, stageId)
  }

  @Get('chapters/:id/stages/:stageId/pages')
  @Roles(RoleName.MANGAKA, RoleName.EDITOR)
  @ApiOperation({ summary: 'Liệt kê immutable input/output snapshot của page trong stage' })
  @ApiErrors(StageAccessDeniedException, StageNotFoundException)
  @ZodResponse({ status: 200, type: StagePageListResDto })
  listPages(@ActiveUser() user: JwtAccessTokenPayload, @Param('id') id: string, @Param('stageId') stageId: string) {
    return this.pageService.listStagePages(user, id, stageId)
  }

  @Put('chapters/:id/stages/:stageId/outputs')
  @Roles(RoleName.MANGAKA)
  @ApiOperation({ summary: 'Xác nhận output của toàn bộ page trong stage ACTIVE' })
  @ApiErrors(
    StageAccessDeniedException,
    StageNotFoundException,
    StageNotActiveException,
    StageHasOpenTasksException,
    StagePageNotFoundException,
    StageOutputInvalidException,
    ProductionNotFinalizedException
  )
  @ZodResponse({ status: 200, type: StagePageListResDto })
  confirmOutputs(
    @ActiveUser() user: JwtAccessTokenPayload,
    @Param('id') id: string,
    @Param('stageId') stageId: string,
    @Body() body: ConfirmStageOutputsBodyDto
  ) {
    return this.pageService.confirmOutputs(user.userId, id, stageId, body)
  }
}
