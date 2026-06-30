import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { ApiErrors } from 'src/core/http/decorators/api-errors.decorator'
import { ActiveUser } from 'src/core/security/decorators/active-user.decorator'
import { Roles } from 'src/core/security/decorators/roles.decorator'
import { RoleName } from 'src/core/security/constants/role.constant'
import {
  AssignmentListResDto,
  AssignmentResDto,
  CreateInviteBodyDto,
  InviteListResDto,
  InviteResDto,
  ListAssignmentsQueryDto,
  ListInvitesQueryDto,
  TerminateAssignmentBodyDto
} from './dto/studio.dto'
import {
  AssignmentNotActiveException,
  AssignmentNotFoundException,
  AssistantNotFoundException,
  DuplicateActiveCollaborationException,
  InvalidHirePeriodException,
  InviteNotFoundException,
  InviteNotPendingException,
  NotAssignmentOwnerException,
  NotInviteOwnerException,
  NotInviteeException,
  TargetNotAssistantException
} from './errors/studio.errors'
import { StudioService } from './studio.service'

@ApiTags('studio')
@ApiBearerAuth()
@Controller()
export class StudioController {
  constructor(private readonly studioService: StudioService) {}

  // ---- Collaboration invites ----
  @Post('collaboration-invites')
  @ApiOperation({ summary: 'Mangaka mời Assistant cộng tác → invite PENDING + notify' })
  @ApiResponse({ status: 422, description: 'Validation fail' })
  @ApiErrors(
    AssistantNotFoundException,
    TargetNotAssistantException,
    InvalidHirePeriodException,
    DuplicateActiveCollaborationException
  )
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 201, type: InviteResDto })
  createInvite(@Body() body: CreateInviteBodyDto, @ActiveUser('userId') userId: string) {
    return this.studioService.createInvite(userId, body)
  }

  @Get('collaboration-invites')
  @ApiOperation({ summary: 'Danh sách invite theo scope role (Mangaka=gửi, Assistant=nhận)' })
  @Roles(RoleName.MANGAKA, RoleName.ASSISTANT)
  @ZodResponse({ status: 200, type: InviteListResDto })
  listInvites(
    @Query() query: ListInvitesQueryDto,
    @ActiveUser('userId') userId: string,
    @ActiveUser('roleName') roleName: string
  ) {
    return this.studioService.listInvites(userId, roleName, query)
  }

  @Get('collaboration-invites/:id')
  @ApiOperation({ summary: 'Chi tiết 1 invite (chỉ owner hoặc invitee)' })
  @ApiErrors(InviteNotFoundException)
  @Roles(RoleName.MANGAKA, RoleName.ASSISTANT)
  @ZodResponse({ status: 200, type: InviteResDto })
  getInvite(@Param('id') id: string, @ActiveUser('userId') userId: string) {
    return this.studioService.getInvite(userId, id)
  }

  @Post('collaboration-invites/:id/accept')
  @ApiOperation({ summary: 'Assistant chấp nhận invite → tạo StudioAssignment ACTIVE' })
  @ApiErrors(
    InviteNotFoundException,
    NotInviteeException,
    InviteNotPendingException,
    DuplicateActiveCollaborationException
  )
  @Roles(RoleName.ASSISTANT)
  @ZodResponse({ status: 201, type: AssignmentResDto })
  acceptInvite(@Param('id') id: string, @ActiveUser('userId') userId: string) {
    return this.studioService.acceptInvite(userId, id)
  }

  @Post('collaboration-invites/:id/decline')
  @ApiOperation({ summary: 'Assistant từ chối invite → DECLINED' })
  @ApiErrors(InviteNotFoundException, NotInviteeException, InviteNotPendingException)
  @Roles(RoleName.ASSISTANT)
  @ZodResponse({ status: 201, type: InviteResDto })
  declineInvite(@Param('id') id: string, @ActiveUser('userId') userId: string) {
    return this.studioService.declineInvite(userId, id)
  }

  @Post('collaboration-invites/:id/cancel')
  @ApiOperation({ summary: 'Mangaka huỷ invite của mình → CANCELLED' })
  @ApiErrors(InviteNotFoundException, NotInviteOwnerException, InviteNotPendingException)
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 201, type: InviteResDto })
  cancelInvite(@Param('id') id: string, @ActiveUser('userId') userId: string) {
    return this.studioService.cancelInvite(userId, id)
  }

  // ---- Studio assignments ----
  @Get('studio-assignments')
  @ApiOperation({ summary: 'Danh sách assignment theo scope role (filter status / activeNow=true)' })
  @Roles(RoleName.MANGAKA, RoleName.ASSISTANT)
  @ZodResponse({ status: 200, type: AssignmentListResDto })
  listAssignments(
    @Query() query: ListAssignmentsQueryDto,
    @ActiveUser('userId') userId: string,
    @ActiveUser('roleName') roleName: string
  ) {
    return this.studioService.listAssignments(userId, roleName, query)
  }

  @Get('studio-assignments/:id')
  @ApiOperation({ summary: 'Chi tiết 1 assignment (chỉ mangaka owner hoặc assistant)' })
  @ApiErrors(AssignmentNotFoundException)
  @Roles(RoleName.MANGAKA, RoleName.ASSISTANT)
  @ZodResponse({ status: 200, type: AssignmentResDto })
  getAssignment(
    @Param('id') id: string,
    @ActiveUser('userId') userId: string,
    @ActiveUser('roleName') roleName: string
  ) {
    return this.studioService.getAssignment(userId, roleName, id)
  }

  @Post('studio-assignments/:id/terminate')
  @ApiOperation({ summary: 'Mangaka kết thúc sớm assignment ACTIVE → TERMINATED + notify' })
  @ApiResponse({ status: 422, description: 'Validation fail' })
  @ApiErrors(AssignmentNotFoundException, NotAssignmentOwnerException, AssignmentNotActiveException)
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 201, type: AssignmentResDto })
  terminateAssignment(
    @Param('id') id: string,
    @Body() body: TerminateAssignmentBodyDto,
    @ActiveUser('userId') userId: string
  ) {
    return this.studioService.terminateAssignment(userId, id, body.reason)
  }
}
