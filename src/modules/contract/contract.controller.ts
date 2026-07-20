import { Controller, Get, Post, Body, Param, Patch } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { ContractService } from './services/contract.service'
import { PaymentService } from '../payment/services/payment.service'
import {
  CreateContractBodyDto,
  EditorUpdateContractBodyDto,
  SignContractWithOtpBodyDto,
  ContractResDto,
  ContractVersionResDto,
  ContractHealthResDto,
  ContractSignResDto,
  ContractStatusProgressResDto,
  ReportRevenueBodyDto,
  ContractPdfResDto,
  ContractChangeReasonBodyDto
} from './dto/contract.dto'
import { MessageResDto } from 'src/core/http/dto/response.dto'
import {
  CreatePaymentConditionBodyDto,
  UpdatePaymentConditionBodyDto,
  PaymentConditionResDto,
  PaymentConditionListResDto
} from '../payment/dto/payment-condition.dto'
import {
  PaymentConditionNotFoundException,
  PaymentConditionNotEditableException,
  ContractNotFoundForPaymentException,
  UnauthorizedPaymentConditionEditorException
} from '../payment/errors/payment.error'
import { ContractErrors } from './errors/contract.errors'
import { ApiErrors } from 'src/core/http/decorators/api-errors.decorator'
import { ContractStatus } from '@prisma/client'
import { RoleName } from 'src/core/security/constants/role.constant'
import { Roles } from 'src/core/security/decorators/roles.decorator'
import { ActiveUser } from 'src/core/security/decorators/active-user.decorator'
import { ContractAmendmentService } from './services/contract-amendment.service'
import {
  CreateAmendmentBodyDto,
  UpdateAmendmentBodyDto,
  RejectAmendmentBodyDto,
  VoidAmendmentBodyDto,
  SignAmendmentBodyDto,
  AmendmentResDto
} from './dto/contract-amendment.dto'

@ApiTags('contracts')
@ApiBearerAuth()
@Controller('contracts')
export class ContractController {
  constructor(
    private readonly contractService: ContractService,
    private readonly paymentService: PaymentService,
    private readonly amendmentService: ContractAmendmentService
  ) {}

  @ApiOperation({ summary: 'Health check module contract' })
  @Get('health')
  @ZodResponse({ status: 200, type: ContractHealthResDto })
  health() {
    return this.contractService.healthCheck()
  }

  @ApiOperation({ summary: 'Danh sách hợp đồng theo scope role hiện tại' })
  @Get()
  @Roles(RoleName.EDITOR, RoleName.MANGAKA, RoleName.BOARD_MEMBER)
  @ZodResponse({ status: 200, type: [ContractResDto] })
  getContracts(@ActiveUser('userId') userId: string, @ActiveUser('roleName') roleName: string) {
    return this.contractService.getContracts(userId, roleName)
  }

  @ApiOperation({ summary: 'Tải PDF hợp đồng đã ký (từ FULLY_EXECUTED trở đi) — Spec 24' })
  @Get(':id/pdf')
  @Roles(RoleName.EDITOR, RoleName.MANGAKA, RoleName.BOARD_MEMBER)
  @ApiErrors(
    ContractErrors.NotFound(),
    ContractErrors.ContractAccessDenied(),
    ContractErrors.ContractNotExecutedForPdf()
  )
  @ZodResponse({ status: 200, type: ContractPdfResDto })
  exportPdf(@Param('id') id: string, @ActiveUser('userId') userId: string, @ActiveUser('roleName') roleName: string) {
    return this.contractService.exportPdf(id, userId, roleName)
  }

  @ApiOperation({ summary: 'Chi tiết hợp đồng' })
  @Get(':id')
  @Roles(RoleName.EDITOR, RoleName.MANGAKA, RoleName.BOARD_MEMBER)
  @ApiErrors(ContractErrors.NotFound(), ContractErrors.ContractAccessDenied())
  @ZodResponse({ status: 200, type: ContractResDto })
  getContractById(
    @Param('id') id: string,
    @ActiveUser('userId') userId: string,
    @ActiveUser('roleName') roleName: string
  ) {
    return this.contractService.getContractById(id, userId, roleName)
  }

  @ApiOperation({ summary: 'Danh sách phiên bản hợp đồng' })
  @Get(':id/versions')
  @Roles(RoleName.EDITOR, RoleName.MANGAKA, RoleName.BOARD_MEMBER)
  @ApiErrors(ContractErrors.NotFound(), ContractErrors.ContractAccessDenied())
  @ZodResponse({ status: 200, type: [ContractVersionResDto] })
  getContractVersions(
    @Param('id') id: string,
    @ActiveUser('userId') userId: string,
    @ActiveUser('roleName') roleName: string
  ) {
    return this.contractService.getContractVersions(id, userId, roleName)
  }

  @ApiOperation({ summary: 'Chi tiết một phiên bản hợp đồng' })
  @Get(':id/versions/:versionId')
  @Roles(RoleName.EDITOR, RoleName.MANGAKA, RoleName.BOARD_MEMBER)
  @ApiErrors(ContractErrors.NotFound(), ContractErrors.ContractAccessDenied())
  @ZodResponse({ status: 200, type: ContractVersionResDto })
  getContractVersionById(
    @Param('id') id: string,
    @Param('versionId') versionId: string,
    @ActiveUser('userId') userId: string,
    @ActiveUser('roleName') roleName: string
  ) {
    return this.contractService.getContractVersionById(id, versionId, userId, roleName)
  }

  @ApiOperation({ summary: 'Editor tạo hợp đồng nháp cho series đã SERIALIZED → DRAFT (B-CON-01)' })
  @ApiErrors(
    ContractErrors.SeriesNotSerialized(),
    ContractErrors.NotFound(),
    ContractErrors.ContractCreationBoardDecisionNotFound(),
    ContractErrors.InvalidSerializationDecision(),
    ContractErrors.ContractMangakaMismatch(),
    ContractErrors.OpenContractExists()
  )
  @Post()
  @Roles(RoleName.EDITOR)
  @ZodResponse({ status: 201, type: ContractResDto })
  createDraft(@ActiveUser('userId') userId: string, @Body() dto: CreateContractBodyDto) {
    return this.contractService.createDraft(userId, dto)
  }

  @ApiOperation({ summary: 'Editor cập nhật điều khoản hợp đồng nháp' })
  @Patch(':id')
  @Roles(RoleName.EDITOR)
  @ZodResponse({ status: 200, type: ContractResDto })
  updateContract(
    @Param('id') id: string,
    @ActiveUser('userId') userId: string,
    @Body() dto: EditorUpdateContractBodyDto
  ) {
    const { note, ...updateData } = dto
    return this.contractService.editorUpdateContract(id, userId, updateData, note)
  }

  @ApiOperation({ summary: 'Editor/Mangaka cập nhật trạng thái hợp đồng theo workflow' })
  @Patch(':id/status')
  @Roles(RoleName.EDITOR, RoleName.MANGAKA)
  @ApiErrors(
    ContractErrors.NotFound(),
    ContractErrors.UnauthorizedEditor(),
    ContractErrors.NotContractMangaka(),
    ContractErrors.InvalidContractTransition()
  )
  @ZodResponse({ status: 200, type: ContractResDto })
  updateStatus(@Param('id') id: string, @ActiveUser('userId') userId: string, @Body('status') status: ContractStatus) {
    return this.contractService.updateStatusByWorkflow(id, userId, status)
  }

  @ApiOperation({ summary: 'B-CON-02: Mangaka yêu cầu chỉnh sửa điều khoản → NEGOTIATION' })
  @Post(':id/request-changes')
  @Roles(RoleName.MANGAKA)
  @ApiErrors(ContractErrors.NotFound(), ContractErrors.NotContractMangaka(), ContractErrors.InvalidContractTransition())
  @ZodResponse({ status: 201, type: ContractResDto })
  requestChanges(
    @Param('id') id: string,
    @ActiveUser('userId') userId: string,
    @Body() body: ContractChangeReasonBodyDto
  ) {
    return this.contractService.mangakaRequestChanges(id, userId, body.reason)
  }

  @ApiOperation({ summary: 'B-CON-02 (BOARD_REVIEW): Hội đồng duyệt điều khoản → BOARD_APPROVED' })
  @Post(':id/board-approve')
  @Roles(RoleName.BOARD_MEMBER)
  @ApiErrors(
    ContractErrors.NotFound(),
    ContractErrors.BoardDecisionNotFound(),
    ContractErrors.NotAuthorizedInBoard(),
    ContractErrors.InvalidContractTransition()
  )
  @ZodResponse({ status: 201, type: ContractResDto })
  boardApprove(@Param('id') id: string, @ActiveUser('userId') userId: string) {
    return this.contractService.boardApprove(id, userId)
  }

  @ApiOperation({ summary: 'B-CON-02 (BOARD_REVIEW): Hội đồng yêu cầu chỉnh sửa → NEGOTIATION' })
  @Post(':id/board-request-changes')
  @Roles(RoleName.BOARD_MEMBER)
  @ApiErrors(
    ContractErrors.NotFound(),
    ContractErrors.BoardDecisionNotFound(),
    ContractErrors.NotAuthorizedInBoard(),
    ContractErrors.InvalidContractTransition()
  )
  @ZodResponse({ status: 201, type: ContractResDto })
  boardRequestChanges(
    @Param('id') id: string,
    @ActiveUser('userId') userId: string,
    @Body() body: ContractChangeReasonBodyDto
  ) {
    return this.contractService.boardRequestChanges(id, userId, body.reason)
  }

  @ApiOperation({ summary: 'Mangaka ký hợp đồng bằng OTP' })
  @Post(':id/signatures/mangaka')
  @Roles(RoleName.MANGAKA)
  @ApiErrors(
    ContractErrors.NotFound(),
    ContractErrors.AlreadySigned(),
    ContractErrors.NotSignableYet(),
    ContractErrors.NotContractMangaka()
  )
  @ZodResponse({ status: 201, type: ContractResDto })
  signMangaka(
    @Param('id') id: string,
    @ActiveUser('userId') userId: string,
    @ActiveUser('email') userEmail: string,
    @Body() body: SignContractWithOtpBodyDto
  ) {
    return this.contractService.signByMangakaWithOtp(id, userId, userEmail, body.otpCode)
  }

  @ApiOperation({ summary: 'Board ký hợp đồng bằng OTP' })
  @Post(':id/signatures/board')
  @Roles(RoleName.BOARD_MEMBER)
  @ApiErrors(
    ContractErrors.NotFound(),
    ContractErrors.AlreadySigned(),
    ContractErrors.NotSignableYet(),
    ContractErrors.BoardDecisionNotFound(),
    ContractErrors.NotAuthorizedInBoard(),
    ContractErrors.BoardMemberAlreadySigned()
  )
  @ZodResponse({ status: 201, type: ContractSignResDto })
  signBoard(
    @Param('id') id: string,
    @ActiveUser('userId') userId: string,
    @ActiveUser('email') userEmail: string,
    @Body() body: SignContractWithOtpBodyDto
  ) {
    return this.contractService.signByBoardWithOtp(id, userId, userEmail, body.otpCode)
  }

  @ApiOperation({
    summary: 'Board/Editor nhập doanh thu kỳ cho HĐ REVENUE_SHARE → chia theo ownership split (B-CON-07)'
  })
  @ApiErrors(ContractErrors.NotFound(), ContractErrors.RevenueNotApplicable(), ContractErrors.UnauthorizedEditor())
  @Post(':id/revenue')
  @Roles(RoleName.BOARD_MEMBER, RoleName.EDITOR)
  @ZodResponse({ status: 201, type: MessageResDto })
  reportRevenue(
    @Param('id') id: string,
    @ActiveUser('userId') userId: string,
    @ActiveUser('roleName') roleName: string,
    @Body() body: ReportRevenueBodyDto
  ) {
    return this.contractService.reportRevenue(id, userId, roleName, body)
  }

  @ApiOperation({ summary: 'Xem trạng thái hợp đồng và tiến độ ký' })
  @ApiErrors(ContractErrors.NotFound(), ContractErrors.NotContractMangaka())
  @Get(':id/status')
  @Roles(RoleName.EDITOR, RoleName.MANGAKA, RoleName.BOARD_MEMBER)
  @ZodResponse({ status: 200, type: ContractStatusProgressResDto })
  checkStatus(@Param('id') id: string, @ActiveUser('userId') userId: string, @ActiveUser('roleName') role: string) {
    return this.contractService.checkContractStatus(id, userId, role)
  }

  @ApiOperation({ summary: 'Editor tạo điều kiện thanh toán cho hợp đồng' })
  @Post(':contractId/payment-conditions')
  @ApiResponse({ status: 422, description: 'Validation fail' })
  @ApiErrors(new ContractNotFoundForPaymentException(), new UnauthorizedPaymentConditionEditorException())
  @Roles(RoleName.EDITOR)
  @ZodResponse({ status: 201, type: PaymentConditionResDto })
  createPaymentCondition(
    @Param('contractId') contractId: string,
    @ActiveUser('userId') editorId: string,
    @Body() dto: CreatePaymentConditionBodyDto
  ) {
    return this.paymentService.createPaymentCondition(contractId, editorId, dto)
  }

  @ApiOperation({ summary: 'Danh sách điều kiện thanh toán của hợp đồng' })
  @Get(':contractId/payment-conditions')
  @ApiErrors(new ContractNotFoundForPaymentException(), new UnauthorizedPaymentConditionEditorException())
  @Roles(RoleName.EDITOR, RoleName.MANGAKA, RoleName.BOARD_MEMBER)
  @ZodResponse({ status: 200, type: PaymentConditionListResDto })
  getPaymentConditions(
    @Param('contractId') contractId: string,
    @ActiveUser('userId') userId: string,
    @ActiveUser('roleName') roleName: string
  ) {
    return this.paymentService.getPaymentConditionsByContract(contractId, userId, roleName)
  }

  @ApiOperation({ summary: 'Editor cập nhật điều kiện thanh toán của hợp đồng' })
  @Patch(':contractId/payment-conditions/:conditionId')
  @ApiResponse({ status: 422, description: 'Validation fail' })
  @ApiErrors(
    new ContractNotFoundForPaymentException(),
    new UnauthorizedPaymentConditionEditorException(),
    new PaymentConditionNotFoundException(),
    new PaymentConditionNotEditableException()
  )
  @Roles(RoleName.EDITOR)
  @ZodResponse({ status: 200, type: PaymentConditionResDto })
  updatePaymentCondition(
    @Param('contractId') contractId: string,
    @Param('conditionId') conditionId: string,
    @ActiveUser('userId') editorId: string,
    @Body() dto: UpdatePaymentConditionBodyDto
  ) {
    return this.paymentService.updatePaymentCondition(contractId, conditionId, editorId, dto)
  }

  @ApiOperation({ summary: 'Editor vô hiệu hóa điều kiện thanh toán' })
  @Patch(':contractId/payment-conditions/:conditionId/disable')
  @ApiErrors(
    new ContractNotFoundForPaymentException(),
    new UnauthorizedPaymentConditionEditorException(),
    new PaymentConditionNotFoundException(),
    new PaymentConditionNotEditableException()
  )
  @Roles(RoleName.EDITOR)
  @ZodResponse({ status: 200, type: PaymentConditionResDto })
  disablePaymentCondition(
    @Param('contractId') contractId: string,
    @Param('conditionId') conditionId: string,
    @ActiveUser('userId') editorId: string
  ) {
    return this.paymentService.disablePaymentCondition(contractId, conditionId, editorId)
  }

  // ===== Spec 4: Contract Amendment (B-CON-08) =====

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
  @ZodResponse({ status: 200, type: [AmendmentResDto] })
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
