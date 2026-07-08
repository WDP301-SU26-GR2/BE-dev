import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { ApiErrors } from 'src/core/http/decorators/api-errors.decorator'
import { ActiveUser } from 'src/core/security/decorators/active-user.decorator'
import { RoleName } from 'src/core/security/constants/role.constant'
import { Roles } from 'src/core/security/decorators/roles.decorator'
import {
  BoardResolveBodyDto,
  CounterDeadlineBodyDto,
  CreateDeadlineRequestBodyDto,
  DeadlineReasonBodyDto,
  DeadlineRequestListResDto,
  DeadlineRequestResDto,
  ListDeadlineRequestQueryDto
} from './dto/deadline.dto'
import { DeadlineService } from './deadline.service'
import {
  DeadlineNotAwaitingBoardException,
  DeadlineRequestAccessDeniedException,
  DeadlineRequestNotAllowedException,
  DeadlineRequestNotFoundException,
  InvalidDeadlineRequestTransitionException,
  NotCounterpartyException,
  OpenDeadlineRequestExistsException
} from './errors/deadline.errors'

@ApiTags('deadline-requests')
@ApiBearerAuth()
@Controller('deadline-requests')
export class DeadlineController {
  constructor(private readonly deadlineService: DeadlineService) {}

  @Post()
  @ApiOperation({ summary: 'Mangaka/Editor tạo yêu cầu đổi deadline → PROPOSED' })
  @ApiErrors(
    DeadlineRequestNotFoundException,
    DeadlineRequestAccessDeniedException,
    OpenDeadlineRequestExistsException,
    DeadlineRequestNotAllowedException
  )
  @Roles(RoleName.MANGAKA, RoleName.EDITOR)
  @ZodResponse({ status: 201, type: DeadlineRequestResDto })
  create(@Body() body: CreateDeadlineRequestBodyDto, @ActiveUser('userId') userId: string) {
    return this.deadlineService.create(userId, body)
  }

  @Post(':id/counter')
  @ApiOperation({ summary: 'Bên kia đề xuất deadline khác → COUNTER_PROPOSED' })
  @ApiErrors(
    DeadlineRequestNotFoundException,
    DeadlineRequestAccessDeniedException,
    NotCounterpartyException,
    InvalidDeadlineRequestTransitionException
  )
  @Roles(RoleName.MANGAKA, RoleName.EDITOR)
  @ZodResponse({ status: 201, type: DeadlineRequestResDto })
  counter(@Param('id') id: string, @Body() body: CounterDeadlineBodyDto, @ActiveUser('userId') userId: string) {
    return this.deadlineService.counter(userId, id, body)
  }

  @Post(':id/agree')
  @ApiOperation({ summary: 'Bên kia đồng ý → AGREED_BY_PARTIES' })
  @ApiErrors(
    DeadlineRequestNotFoundException,
    DeadlineRequestAccessDeniedException,
    NotCounterpartyException,
    InvalidDeadlineRequestTransitionException
  )
  @Roles(RoleName.MANGAKA, RoleName.EDITOR)
  @ZodResponse({ status: 201, type: DeadlineRequestResDto })
  agree(@Param('id') id: string, @ActiveUser('userId') userId: string) {
    return this.deadlineService.agree(userId, id)
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Bên kia từ chối → ESCALATED (leo Board, defer B5)' })
  @ApiErrors(
    DeadlineRequestNotFoundException,
    DeadlineRequestAccessDeniedException,
    NotCounterpartyException,
    InvalidDeadlineRequestTransitionException
  )
  @Roles(RoleName.MANGAKA, RoleName.EDITOR)
  @ZodResponse({ status: 201, type: DeadlineRequestResDto })
  reject(@Param('id') id: string, @Body() body: DeadlineReasonBodyDto, @ActiveUser('userId') userId: string) {
    return this.deadlineService.reject(userId, id, body)
  }

  @Post(':id/withdraw')
  @ApiOperation({ summary: 'Người khởi tạo rút yêu cầu → REJECTED (terminal)' })
  @ApiErrors(
    DeadlineRequestNotFoundException,
    DeadlineRequestAccessDeniedException,
    InvalidDeadlineRequestTransitionException
  )
  @Roles(RoleName.MANGAKA, RoleName.EDITOR)
  @ZodResponse({ status: 201, type: DeadlineRequestResDto })
  withdraw(@Param('id') id: string, @ActiveUser('userId') userId: string) {
    return this.deadlineService.withdraw(userId, id)
  }

  @Post(':id/finalize')
  @ApiOperation({
    summary: 'Editor chốt: !affectsSlot → APPROVED (cập nhật Schedule) | affectsSlot → BOARD_REVIEW (defer B5)'
  })
  @ApiErrors(
    DeadlineRequestNotFoundException,
    DeadlineRequestAccessDeniedException,
    InvalidDeadlineRequestTransitionException
  )
  @Roles(RoleName.EDITOR)
  @ZodResponse({ status: 201, type: DeadlineRequestResDto })
  finalize(@Param('id') id: string, @ActiveUser('userId') userId: string) {
    return this.deadlineService.finalizeRequest(userId, id)
  }

  @Post(':id/board-resolve')
  @ApiOperation({
    summary: 'A-DL-03: Board chốt request BOARD_REVIEW/ESCALATED → APPROVED (cập nhật Schedule) | REJECTED'
  })
  @ApiErrors(DeadlineRequestNotFoundException, DeadlineNotAwaitingBoardException)
  @Roles(RoleName.BOARD_MEMBER)
  @ZodResponse({ status: 201, type: DeadlineRequestResDto })
  boardResolve(@Param('id') id: string, @Body() body: BoardResolveBodyDto, @ActiveUser('userId') userId: string) {
    return this.deadlineService.boardResolve(userId, id, body)
  }

  @Get()
  @ApiOperation({ summary: 'List deadline-request theo chapter (scope theo role)' })
  @ApiErrors(DeadlineRequestNotFoundException, DeadlineRequestAccessDeniedException)
  @Roles(RoleName.MANGAKA, RoleName.EDITOR, RoleName.BOARD_MEMBER, RoleName.SUPER_ADMIN)
  @ZodResponse({ status: 200, type: DeadlineRequestListResDto })
  list(
    @Query() query: ListDeadlineRequestQueryDto,
    @ActiveUser('userId') userId: string,
    @ActiveUser('roleName') roleName: string
  ) {
    return this.deadlineService.list(userId, roleName, query)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết 1 deadline-request (scope theo role)' })
  @ApiErrors(DeadlineRequestNotFoundException, DeadlineRequestAccessDeniedException)
  @Roles(RoleName.MANGAKA, RoleName.EDITOR, RoleName.BOARD_MEMBER, RoleName.SUPER_ADMIN)
  @ZodResponse({ status: 200, type: DeadlineRequestResDto })
  getOne(@Param('id') id: string, @ActiveUser('userId') userId: string, @ActiveUser('roleName') roleName: string) {
    return this.deadlineService.getOne(userId, roleName, id)
  }
}
