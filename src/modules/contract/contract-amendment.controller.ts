import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { ApiErrors } from 'src/core/http/decorators/api-errors.decorator'
import { RoleName } from 'src/core/security/constants/role.constant'
import { ActiveUser } from 'src/core/security/decorators/active-user.decorator'
import { Roles } from 'src/core/security/decorators/roles.decorator'
import {
  AmendmentListItemDto,
  AmendmentResDto,
  CreateAmendmentBodyDto,
  RejectAmendmentBodyDto,
  SignAmendmentBodyDto,
  UpdateAmendmentBodyDto,
  VoidAmendmentBodyDto
} from './dto/contract-amendment.dto'
import { ContractErrors } from './errors/contract.errors'
import { ContractAmendmentService } from './services/contract-amendment.service'

@ApiTags('contracts')
@ApiBearerAuth()
@Controller('contracts')
export class ContractAmendmentController {
  constructor(private readonly amendmentService: ContractAmendmentService) {}

  @ApiOperation({ summary: 'Editor tạo phụ lục hợp đồng đã FULLY_EXECUTED → DRAFT (B-CON-08)' })
  @ApiErrors(
    ContractErrors.NotFound(),
    ContractErrors.ContractNotAmendable(),
    ContractErrors.UnauthorizedEditor(),
    ContractErrors.OpenAmendmentExists(),
    ContractErrors.OwnershipMismatch()
  )
  @Post(':contractId/amendments')
  @Roles(RoleName.EDITOR)
  @ZodResponse({ status: 201, type: AmendmentResDto })
  createAmendment(
    @Param('contractId') contractId: string,
    @ActiveUser('userId') editorId: string,
    @Body() dto: CreateAmendmentBodyDto
  ) {
    return this.amendmentService.create(contractId, editorId, dto)
  }

  @ApiOperation({ summary: 'Danh sách phụ lục của hợp đồng' })
  @Get(':contractId/amendments')
  @Roles(RoleName.EDITOR, RoleName.MANGAKA, RoleName.BOARD_MEMBER)
  @ApiErrors(ContractErrors.NotFound(), ContractErrors.ContractAccessDenied())
  @ZodResponse({ status: 200, type: [AmendmentListItemDto] })
  listAmendments(
    @Param('contractId') contractId: string,
    @ActiveUser('userId') userId: string,
    @ActiveUser('roleName') roleName: string
  ) {
    return this.amendmentService.list(contractId, userId, roleName)
  }

  @ApiOperation({ summary: 'Chi tiết một phụ lục' })
  @ApiErrors(ContractErrors.AmendmentNotFound(), ContractErrors.ContractAccessDenied())
  @Get(':contractId/amendments/:id')
  @Roles(RoleName.EDITOR, RoleName.MANGAKA, RoleName.BOARD_MEMBER)
  @ZodResponse({ status: 200, type: AmendmentResDto })
  getAmendment(
    @Param('contractId') contractId: string,
    @Param('id') id: string,
    @ActiveUser('userId') userId: string,
    @ActiveUser('roleName') roleName: string
  ) {
    return this.amendmentService.detail(contractId, id, userId, roleName)
  }

  @ApiOperation({ summary: 'Editor sửa phụ lục khi DRAFT (reset chữ ký)' })
  @ApiErrors(
    ContractErrors.AmendmentNotFound(),
    ContractErrors.AmendmentNotEditable(),
    ContractErrors.OwnershipMismatch()
  )
  @Patch(':contractId/amendments/:id')
  @Roles(RoleName.EDITOR)
  @ZodResponse({ status: 200, type: AmendmentResDto })
  updateAmendment(
    @Param('contractId') contractId: string,
    @Param('id') id: string,
    @ActiveUser('userId') editorId: string,
    @Body() dto: UpdateAmendmentBodyDto
  ) {
    return this.amendmentService.update(contractId, id, editorId, dto)
  }

  @ApiOperation({ summary: 'Editor trình phụ lục để ký (DRAFT → PENDING_SIGNATURES)' })
  @ApiErrors(
    ContractErrors.AmendmentNotFound(),
    ContractErrors.AmendmentNotSubmittable(),
    ContractErrors.AmendmentNoChanges()
  )
  @Post(':contractId/amendments/:id/submit')
  @Roles(RoleName.EDITOR)
  @ZodResponse({ status: 200, type: AmendmentResDto })
  submitAmendment(
    @Param('contractId') contractId: string,
    @Param('id') id: string,
    @ActiveUser('userId') editorId: string
  ) {
    return this.amendmentService.submit(contractId, id, editorId)
  }

  @ApiOperation({ summary: 'Mangaka ký phụ lục bằng OTP (chỉ REVENUE_SHARE)' })
  @ApiErrors(
    ContractErrors.AmendmentNotPendingSignatures(),
    ContractErrors.ContractApprovalDecisionRequired(),
    ContractErrors.MangakaSignNotRequired(),
    ContractErrors.NotContractMangaka()
  )
  @Post(':contractId/amendments/:id/sign/mangaka')
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 201, type: AmendmentResDto })
  signAmendmentMangaka(
    @Param('contractId') contractId: string,
    @Param('id') id: string,
    @ActiveUser('userId') userId: string,
    @ActiveUser('email') email: string,
    @Body() body: SignAmendmentBodyDto
  ) {
    return this.amendmentService.signMangaka(contractId, id, userId, email, body.otpCode)
  }

  @ApiOperation({ summary: 'Board ký phụ lục bằng OTP' })
  @ApiErrors(
    ContractErrors.AmendmentNotPendingSignatures(),
    ContractErrors.ContractApprovalDecisionRequired(),
    ContractErrors.NotAuthorizedInBoard(),
    ContractErrors.BoardMemberAlreadySigned()
  )
  @Post(':contractId/amendments/:id/sign/board')
  @Roles(RoleName.BOARD_MEMBER)
  @ZodResponse({ status: 201, type: AmendmentResDto })
  signAmendmentBoard(
    @Param('contractId') contractId: string,
    @Param('id') id: string,
    @ActiveUser('userId') userId: string,
    @ActiveUser('email') email: string,
    @Body() body: SignAmendmentBodyDto
  ) {
    return this.amendmentService.signBoard(contractId, id, userId, email, body.otpCode)
  }

  @ApiOperation({ summary: 'Mangaka từ chối phụ lục → về DRAFT (chỉ REVENUE_SHARE)' })
  @ApiErrors(
    ContractErrors.AmendmentNotPendingSignatures(),
    ContractErrors.MangakaSignNotRequired(),
    ContractErrors.NotContractMangaka()
  )
  @Post(':contractId/amendments/:id/reject')
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 200, type: AmendmentResDto })
  rejectAmendment(
    @Param('contractId') contractId: string,
    @Param('id') id: string,
    @ActiveUser('userId') userId: string,
    @Body() body: RejectAmendmentBodyDto
  ) {
    return this.amendmentService.reject(contractId, id, userId, body.reason)
  }

  @ApiOperation({ summary: 'Editor hủy phụ lục (non-terminal → VOIDED)' })
  @ApiErrors(
    ContractErrors.AmendmentNotFound(),
    ContractErrors.AmendmentNotVoidable(),
    ContractErrors.UnauthorizedEditor()
  )
  @Post(':contractId/amendments/:id/void')
  @Roles(RoleName.EDITOR)
  @ZodResponse({ status: 200, type: AmendmentResDto })
  voidAmendment(
    @Param('contractId') contractId: string,
    @Param('id') id: string,
    @ActiveUser('userId') editorId: string,
    @Body() body: VoidAmendmentBodyDto
  ) {
    return this.amendmentService.void(contractId, id, editorId, body.voidReason)
  }
}
