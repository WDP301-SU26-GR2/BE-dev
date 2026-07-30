import { Controller, Get, Post, Body, Param, Patch } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { ContractService } from './services/contract.service'
import {
  CreateContractBodyDto,
  EditorUpdateContractBodyDto,
  SignContractWithOtpBodyDto,
  ContractListItemDto,
  ContractResDto,
  ContractVersionResDto,
  ContractHealthResDto,
  ContractSignResDto,
  ContractStatusProgressResDto,
  ReportRevenueBodyDto,
  ContractPdfResDto,
  ContractChangeReasonBodyDto,
  BoardApproveContractBodyDto,
  BoardRequestContractChangesBodyDto
} from './dto/contract.dto'
import { MessageResDto } from 'src/core/http/dto/response.dto'
import { ContractErrors } from './errors/contract.errors'
import { ApiErrors } from 'src/core/http/decorators/api-errors.decorator'
import { ContractStatus } from '@prisma/client'
import { RoleName } from 'src/core/security/constants/role.constant'
import { Roles } from 'src/core/security/decorators/roles.decorator'
import { ActiveUser } from 'src/core/security/decorators/active-user.decorator'

@ApiTags('contracts')
@ApiBearerAuth()
@Controller('contracts')
export class ContractController {
  constructor(private readonly contractService: ContractService) {}

  @ApiOperation({ summary: 'Health check module contract' })
  @Get('health')
  @ZodResponse({ status: 200, type: ContractHealthResDto })
  health() {
    return this.contractService.healthCheck()
  }

  @ApiOperation({ summary: 'Danh sách hợp đồng theo scope role hiện tại' })
  @Get()
  @Roles(RoleName.EDITOR, RoleName.MANGAKA, RoleName.BOARD_MEMBER)
  @ZodResponse({ status: 200, type: [ContractListItemDto] })
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
    ContractErrors.ContractDecisionNotFound(),
    ContractErrors.InvalidContractDecision(),
    ContractErrors.NotAuthorizedInBoard(),
    ContractErrors.InvalidContractTransition()
  )
  @ZodResponse({ status: 201, type: ContractResDto })
  boardApprove(
    @Param('id') id: string,
    @ActiveUser('userId') userId: string,
    @Body() body: BoardApproveContractBodyDto
  ) {
    return this.contractService.boardApprove(id, userId, body.boardDecisionId)
  }

  @ApiOperation({ summary: 'B-CON-02 (BOARD_REVIEW): Hội đồng yêu cầu chỉnh sửa → NEGOTIATION' })
  @Post(':id/board-request-changes')
  @Roles(RoleName.BOARD_MEMBER)
  @ApiErrors(
    ContractErrors.NotFound(),
    ContractErrors.ContractDecisionNotFound(),
    ContractErrors.InvalidContractDecision(),
    ContractErrors.NotAuthorizedInBoard(),
    ContractErrors.InvalidContractTransition()
  )
  @ZodResponse({ status: 201, type: ContractResDto })
  boardRequestChanges(
    @Param('id') id: string,
    @ActiveUser('userId') userId: string,
    @Body() body: BoardRequestContractChangesBodyDto
  ) {
    return this.contractService.boardRequestChanges(id, userId, body.boardDecisionId, body.reason)
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
}
