import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { ApiErrors } from 'src/core/http/decorators/api-errors.decorator'
import { MessageResDto } from 'src/core/http/dto/response.dto'
import { ActiveUser } from 'src/core/security/decorators/active-user.decorator'
import { Roles } from 'src/core/security/decorators/roles.decorator'
import { RoleName } from 'src/core/security/constants/role.constant'
import { ContractErrors } from './errors/contract.errors'
import { ContractService } from './services/contract.service'
import {
  AssignRepresentativeBodyDto,
  ContractCommentListResDto,
  ContractCommentResDto,
  ContractHealthResDto,
  ContractListItemDto,
  ContractPdfResDto,
  ContractResDto,
  ContractStatusProgressResDto,
  ContractVersionResDto,
  CreateContractBodyDto,
  CreateContractCommentBodyDto,
  EditorUpdateContractBodyDto,
  RejectContractBodyDto,
  ReportRevenueBodyDto,
  SignContractWithOtpBodyDto
} from './dto/contract.dto'

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
  @Post()
  @Roles(RoleName.EDITOR)
  @ApiErrors(
    ContractErrors.SeriesNotSerialized(),
    ContractErrors.NotFound(),
    ContractErrors.ContractCreationBoardDecisionNotFound(),
    ContractErrors.InvalidSerializationDecision(),
    ContractErrors.ContractMangakaMismatch(),
    ContractErrors.OpenContractExists()
  )
  @ZodResponse({ status: 201, type: ContractResDto })
  createDraft(@ActiveUser('userId') userId: string, @Body() dto: CreateContractBodyDto) {
    return this.contractService.createDraft(userId, dto)
  }

  @ApiOperation({ summary: 'Editor cập nhật điều khoản hợp đồng khi DRAFT hoặc BOARD_REVIEW' })
  @Patch(':id')
  @Roles(RoleName.EDITOR)
  @ApiErrors(
    ContractErrors.NotFound(),
    ContractErrors.UnauthorizedEditor(),
    ContractErrors.InvalidContractTransition(),
    ContractErrors.InvalidContractMoney()
  )
  @ZodResponse({ status: 200, type: ContractResDto })
  updateContract(
    @Param('id') id: string,
    @ActiveUser('userId') userId: string,
    @Body() dto: EditorUpdateContractBodyDto
  ) {
    const { note, ...updateData } = dto
    return this.contractService.editorUpdateContract(id, userId, updateData, note)
  }

  @ApiOperation({ summary: 'Editor gửi hợp đồng DRAFT sang Board review nội bộ → BOARD_REVIEW' })
  @Post(':id/submit-review')
  @Roles(RoleName.EDITOR)
  @ApiErrors(ContractErrors.NotFound(), ContractErrors.UnauthorizedEditor(), ContractErrors.InvalidContractTransition())
  @ZodResponse({ status: 201, type: ContractResDto })
  submitReview(@Param('id') id: string, @ActiveUser('userId') userId: string) {
    return this.contractService.submitForReview(id, userId)
  }

  @ApiOperation({ summary: 'Board member trong roster nhận làm đại diện ký hợp đồng' })
  @Post(':id/claim')
  @Roles(RoleName.BOARD_MEMBER)
  @ApiErrors(
    ContractErrors.NotFound(),
    ContractErrors.ContractNotInBoardReview(),
    ContractErrors.NotInContractBoardRoster(),
    ContractErrors.ContractRepresentativeAlreadyClaimed()
  )
  @ZodResponse({ status: 201, type: ContractResDto })
  claim(@Param('id') id: string, @ActiveUser('userId') userId: string) {
    return this.contractService.claimRepresentative(id, userId)
  }

  @ApiOperation({ summary: 'Đại diện Hội đồng nhả claim trước khi ký' })
  @Post(':id/release')
  @Roles(RoleName.BOARD_MEMBER)
  @ApiErrors(
    ContractErrors.NotFound(),
    ContractErrors.ContractNotInBoardReview(),
    ContractErrors.NotContractRepresentative()
  )
  @ZodResponse({ status: 201, type: MessageResDto })
  release(@Param('id') id: string, @ActiveUser('userId') userId: string) {
    return this.contractService.releaseRepresentative(id, userId)
  }

  @ApiOperation({ summary: 'Super Admin gán đại diện Hội đồng cho hợp đồng quá hạn claim' })
  @Post(':id/assign-representative')
  @Roles(RoleName.SUPER_ADMIN)
  @ApiErrors(
    ContractErrors.NotFound(),
    ContractErrors.ContractNotInBoardReview(),
    ContractErrors.NotInContractBoardRosterForAssignment()
  )
  @ZodResponse({ status: 201, type: ContractResDto })
  assignRepresentative(
    @Param('id') id: string,
    @ActiveUser('userId') adminId: string,
    @Body() body: AssignRepresentativeBodyDto
  ) {
    return this.contractService.assignRepresentative(id, adminId, body)
  }

  @ApiOperation({ summary: 'Board member trong roster thêm góp ý tư vấn cho hợp đồng BOARD_REVIEW' })
  @Post(':id/comments')
  @Roles(RoleName.BOARD_MEMBER)
  @ApiErrors(
    ContractErrors.NotFound(),
    ContractErrors.ContractNotInBoardReview(),
    ContractErrors.NotInContractBoardRoster()
  )
  @ZodResponse({ status: 201, type: ContractCommentResDto })
  addComment(
    @Param('id') id: string,
    @ActiveUser('userId') userId: string,
    @Body() body: CreateContractCommentBodyDto
  ) {
    return this.contractService.addComment(id, userId, body)
  }

  @ApiOperation({ summary: 'Danh sách góp ý tư vấn hợp đồng' })
  @Get(':id/comments')
  @Roles(RoleName.EDITOR, RoleName.BOARD_MEMBER, RoleName.SUPER_ADMIN)
  @ApiErrors(ContractErrors.NotFound(), ContractErrors.ContractAccessDenied())
  @ZodResponse({ status: 200, type: ContractCommentListResDto })
  listComments(
    @Param('id') id: string,
    @ActiveUser('userId') userId: string,
    @ActiveUser('roleName') roleName: string
  ) {
    return this.contractService.listComments(id, userId, roleName)
  }

  @ApiOperation({ summary: 'Đại diện Hội đồng ký hợp đồng bằng OTP → AWAITING_MANGAKA' })
  @Post(':id/sign-representative')
  @Roles(RoleName.BOARD_MEMBER)
  @ApiErrors(
    ContractErrors.NotFound(),
    ContractErrors.ContractNotInBoardReview(),
    ContractErrors.ContractNoRepresentative(),
    ContractErrors.NotContractRepresentative()
  )
  @ZodResponse({ status: 201, type: ContractResDto })
  signRepresentative(
    @Param('id') id: string,
    @ActiveUser('userId') userId: string,
    @ActiveUser('email') userEmail: string,
    @Body() body: SignContractWithOtpBodyDto
  ) {
    return this.contractService.signByRepresentativeWithOtp(id, userId, userEmail, body.otpCode)
  }

  @ApiOperation({ summary: 'Mangaka ký/accept hợp đồng bằng OTP → FULLY_EXECUTED hoặc ACTIVATION_PENDING' })
  @Post(':id/sign-mangaka')
  @Roles(RoleName.MANGAKA)
  @ApiErrors(
    ContractErrors.NotFound(),
    ContractErrors.ContractNotAwaitingMangaka(),
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

  @ApiOperation({ summary: 'Mangaka từ chối hợp đồng cuối flow → REJECTED_BY_MANGAKA' })
  @Post(':id/reject')
  @Roles(RoleName.MANGAKA)
  @ApiErrors(
    ContractErrors.NotFound(),
    ContractErrors.ContractNotAwaitingMangaka(),
    ContractErrors.NotContractMangaka()
  )
  @ZodResponse({ status: 201, type: ContractResDto })
  reject(@Param('id') id: string, @ActiveUser('userId') userId: string, @Body() body: RejectContractBodyDto) {
    return this.contractService.rejectByMangaka(id, userId, body)
  }

  @ApiOperation({ summary: 'Editor tạo bản nháp mới từ hợp đồng bị Mangaka từ chối' })
  @Post(':id/redraft')
  @Roles(RoleName.EDITOR)
  @ApiErrors(ContractErrors.NotFound(), ContractErrors.UnauthorizedEditor(), ContractErrors.ContractRedraftNotAllowed())
  @ZodResponse({ status: 201, type: ContractResDto })
  redraft(@Param('id') id: string, @ActiveUser('userId') userId: string) {
    return this.contractService.redraft(id, userId)
  }

  @ApiOperation({ summary: 'Xem trạng thái hợp đồng và tiến độ ký' })
  @Get(':id/status')
  @Roles(RoleName.EDITOR, RoleName.MANGAKA, RoleName.BOARD_MEMBER)
  @ApiErrors(ContractErrors.NotFound(), ContractErrors.NotContractMangaka())
  @ZodResponse({ status: 200, type: ContractStatusProgressResDto })
  checkStatus(@Param('id') id: string, @ActiveUser('userId') userId: string, @ActiveUser('roleName') role: string) {
    return this.contractService.checkContractStatus(id, userId, role)
  }

  @ApiOperation({
    summary: 'Board/Editor nhập doanh thu kỳ cho HĐ REVENUE_SHARE → chia theo ownership split (B-CON-07)'
  })
  @Post(':id/revenue')
  @Roles(RoleName.BOARD_MEMBER, RoleName.EDITOR)
  @ApiErrors(ContractErrors.NotFound(), ContractErrors.RevenueNotApplicable(), ContractErrors.UnauthorizedEditor())
  @ZodResponse({ status: 201, type: MessageResDto })
  reportRevenue(
    @Param('id') id: string,
    @ActiveUser('userId') userId: string,
    @ActiveUser('roleName') roleName: string,
    @Body() body: ReportRevenueBodyDto
  ) {
    return this.contractService.reportRevenue(id, userId, roleName, body)
  }
}
