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
  StageReopenResDto,
  UpdateStageBodyDto
} from './dto/production-stage.dto'
import { ChapterNotFoundException, ChapterOnHoldException } from './errors/chapter.errors'
import {
  FinalCheckNotCompletableException,
  ProductionNotFinalizedException,
  StageAccessDeniedException,
  StageHasOpenTasksException,
  StageNotActiveException,
  StageNotDeletableException,
  StageNotEditableException,
  StageNotFoundException,
  StageNotInsertableException,
  StageNotReopenableException,
  StageOutputInvalidException,
  StageOutputNotReadyException,
  StagePageNotFoundException,
  StageReopenNotAllowedException
} from './errors/production-stage.errors'
import { ProductionStageFacade } from './services/production-stage.facade'

@ApiTags('Production Stages')
@ApiBearerAuth()
@Controller()
export class ProductionStageController {
  constructor(private readonly facade: ProductionStageFacade) {}

  @Get('chapters/:id/stages')
  @Roles(RoleName.MANGAKA, RoleName.EDITOR, RoleName.BOARD_MEMBER, RoleName.SUPER_ADMIN)
  @ApiOperation({ summary: 'Danh sách giai đoạn sản xuất của chapter và analytics' })
  @ApiErrors(StageAccessDeniedException)
  @ZodResponse({ status: 200, type: StageListResDto })
  list(@ActiveUser() user: JwtAccessTokenPayload, @Param('id') id: string) {
    return this.facade.list(user, id)
  }

  @Post('chapters/:id/stages/:stageId/complete')
  @Roles(RoleName.MANGAKA)
  @ApiOperation({ summary: 'Hoàn thành stage ACTIVE và mở stage kế tiếp' })
  @ApiErrors(
    StageAccessDeniedException,
    StageNotFoundException,
    StageNotActiveException,
    StageHasOpenTasksException,
    StageOutputNotReadyException,
    FinalCheckNotCompletableException
  )
  @ZodResponse({ status: 201, type: MessageResDto })
  complete(@ActiveUser() user: JwtAccessTokenPayload, @Param('id') id: string, @Param('stageId') stageId: string) {
    return this.facade.complete(user, id, stageId)
  }

  @Post('chapters/:id/stages/:stageId/reopen')
  @Roles(RoleName.MANGAKA)
  @ApiOperation({
    summary: 'Mở lại stage COMPLETED khi Editor yêu cầu chỉnh sửa; các stage phía sau bị đưa về LOCKED'
  })
  @ApiErrors(
    ChapterNotFoundException,
    StageAccessDeniedException,
    ChapterOnHoldException,
    StageReopenNotAllowedException,
    StageNotFoundException,
    StageNotReopenableException,
    StageHasOpenTasksException
  )
  @ZodResponse({ status: 201, type: StageReopenResDto })
  reopen(@ActiveUser() user: JwtAccessTokenPayload, @Param('id') id: string, @Param('stageId') stageId: string) {
    return this.facade.reopen(user, id, stageId)
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
    return this.facade.patch(user, id, stageId, body)
  }

  @Post('chapters/:id/stages')
  @Roles(RoleName.MANGAKA)
  @ApiOperation({ summary: 'Chèn custom stage trong vùng chưa mở' })
  @ApiErrors(StageAccessDeniedException, StageNotFoundException, StageNotInsertableException)
  @ZodResponse({ status: 201, type: ProductionStageResDto })
  add(@ActiveUser() user: JwtAccessTokenPayload, @Param('id') id: string, @Body() body: CreateStageBodyDto) {
    return this.facade.add(user, id, body)
  }

  @Delete('chapters/:id/stages/:stageId')
  @Roles(RoleName.MANGAKA)
  @ApiOperation({ summary: 'Xoá stage LOCKED chưa có task' })
  @ApiErrors(StageAccessDeniedException, StageNotFoundException, StageNotDeletableException)
  @ZodResponse({ status: 200, type: MessageResDto })
  remove(@ActiveUser() user: JwtAccessTokenPayload, @Param('id') id: string, @Param('stageId') stageId: string) {
    return this.facade.remove(user, id, stageId)
  }

  @Get('chapters/:id/stages/:stageId/pages')
  @Roles(RoleName.MANGAKA, RoleName.EDITOR)
  @ApiOperation({ summary: 'Liệt kê immutable input/output snapshot của page trong stage' })
  @ApiErrors(StageAccessDeniedException, StageNotFoundException)
  @ZodResponse({ status: 200, type: StagePageListResDto })
  listPages(@ActiveUser() user: JwtAccessTokenPayload, @Param('id') id: string, @Param('stageId') stageId: string) {
    return this.facade.listPages(user, id, stageId)
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
    return this.facade.confirmOutputs(user, id, stageId, body)
  }
}
