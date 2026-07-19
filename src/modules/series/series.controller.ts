import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { ApiErrors } from 'src/core/http/decorators/api-errors.decorator'
import { MessageResDto } from 'src/core/http/dto/response.dto'
import { ActiveUser } from 'src/core/security/decorators/active-user.decorator'
import { Roles } from 'src/core/security/decorators/roles.decorator'
import { RoleName } from 'src/core/security/constants/role.constant'
import {
  CreateProposalBodyDto,
  CreateProposalResDto,
  FranchiseConsentBodyDto,
  HiatusBodyDto,
  ListSeriesQueryDto,
  ProposeCompletionBodyDto,
  ReasonBodyDto,
  SeriesListResDto,
  SeriesResDto,
  UpdateProposalBodyDto,
  UpdateSeriesMetadataBodyDto
} from './dto/series.dto'
import {
  FranchiseConsentRequiredException,
  InvalidProposalStateException,
  InvalidSeriesTransitionException,
  NotAssignedEditorException,
  NotFranchiseConsentTargetException,
  NotOriginalMangakaException,
  NotSeriesOwnerException,
  ParentSeriesNotFoundException,
  ProposalNotDeletableException,
  ProposalNotEditableException,
  ReviewAlreadyStartedException,
  SeriesAccessDeniedException,
  SeriesAlreadyClaimedException,
  SeriesMetadataConflictException,
  SeriesNotFoundException,
  SeriesNotEditableException,
  SeriesNotInCancellingStateException,
  SeriesNotInEndingStateException,
  SeriesNotProposableForCompletionException,
  SeriesNotReadyToPitchException
} from './errors/series.errors'
import { SeriesService } from './series.service'

@ApiTags('series')
@ApiBearerAuth()
@Controller('series')
export class SeriesController {
  constructor(private readonly seriesService: SeriesService) {}

  @Get()
  @ApiOperation({
    summary: 'Danh sách series theo scope vai trò (Mangaka=của mình; Editor=phụ trách+hàng đợi; Board/Admin=tất cả)'
  })
  @Roles(RoleName.MANGAKA, RoleName.EDITOR, RoleName.BOARD_MEMBER, RoleName.SUPER_ADMIN)
  @ZodResponse({ status: 200, type: SeriesListResDto })
  listSeries(
    @Query() query: ListSeriesQueryDto,
    @ActiveUser('userId') userId: string,
    @ActiveUser('roleName') roleName: string
  ) {
    return this.seriesService.listSeries({ userId, roleName }, query)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết 1 series (kèm proposal)' })
  @ApiErrors(SeriesAccessDeniedException, SeriesNotFoundException)
  @Roles(RoleName.MANGAKA, RoleName.EDITOR, RoleName.BOARD_MEMBER, RoleName.SUPER_ADMIN)
  @ZodResponse({ status: 200, type: SeriesResDto })
  getSeries(@Param('id') id: string, @ActiveUser('userId') userId: string, @ActiveUser('roleName') roleName: string) {
    return this.seriesService.getSeries({ userId, roleName }, id)
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Sửa metadata series (title/coverImage/synopsis/characterDesigns) — Mangaka chủ hoặc Editor phụ trách'
  })
  @ApiErrors(
    SeriesNotFoundException,
    SeriesAccessDeniedException,
    SeriesNotEditableException,
    SeriesMetadataConflictException
  )
  @Roles(RoleName.MANGAKA, RoleName.EDITOR)
  @ZodResponse({ status: 200, type: SeriesResDto })
  updateSeriesMetadata(
    @Param('id') id: string,
    @Body() body: UpdateSeriesMetadataBodyDto,
    @ActiveUser('userId') userId: string,
    @ActiveUser('roleName') roleName: string
  ) {
    return this.seriesService.updateSeriesMetadata({ userId, roleName }, id, body)
  }

  @Post('proposals')
  @ApiOperation({ summary: 'Mangaka tạo proposal mới (Series DRAFT + SeriesProposal + Name chương mẫu)' })
  @ApiErrors(ParentSeriesNotFoundException)
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 201, type: CreateProposalResDto })
  createProposal(@Body() body: CreateProposalBodyDto, @ActiveUser('userId') userId: string) {
    return this.seriesService.createProposal(userId, body)
  }

  @Put('proposals/:id')
  @ApiOperation({ summary: 'Mangaka sửa proposal (partial-update; chỉ DRAFT/PROPOSAL_REVISION; KHÔNG nhận namePages)' })
  @ApiErrors(NotSeriesOwnerException, SeriesNotFoundException, ProposalNotEditableException)
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 200, type: SeriesResDto })
  updateProposal(@Param('id') id: string, @Body() body: UpdateProposalBodyDto, @ActiveUser('userId') userId: string) {
    return this.seriesService.updateProposal(userId, id, body)
  }

  @Delete('proposals/:id')
  @ApiOperation({ summary: 'Mangaka xoá hẳn draft tạo nhầm (chỉ khi Series=DRAFT). Trả message.' })
  @ApiErrors(NotSeriesOwnerException, SeriesNotFoundException, ProposalNotDeletableException)
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 200, type: MessageResDto })
  deleteProposal(@Param('id') id: string, @ActiveUser('userId') userId: string) {
    return this.seriesService.deleteProposal(userId, id)
  }

  @Post(':id/submit')
  @ApiOperation({ summary: 'Mangaka submit → mở 2 vòng review (proposal+Name), Series DRAFT→IN_REVIEW' })
  @ApiErrors(
    NotSeriesOwnerException,
    SeriesNotFoundException,
    InvalidProposalStateException,
    FranchiseConsentRequiredException
  )
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 201, type: CreateProposalResDto })
  submit(@Param('id') id: string, @ActiveUser('userId') userId: string) {
    return this.seriesService.submit(userId, id)
  }

  @Post(':id/proposal/request-revision')
  @ApiOperation({ summary: 'Editor phụ trách yêu cầu sửa proposal (→ PROPOSAL_REVISION). Set reviewStartedAt.' })
  @ApiErrors(NotAssignedEditorException, SeriesNotFoundException, InvalidProposalStateException)
  @Roles(RoleName.EDITOR)
  @ZodResponse({ status: 201, type: SeriesResDto })
  requestProposalRevision(@Param('id') id: string, @Body() body: ReasonBodyDto, @ActiveUser('userId') userId: string) {
    return this.seriesService.requestProposalRevision(userId, id, body.reason)
  }

  @Post(':id/proposal/resubmit')
  @ApiOperation({ summary: 'Mangaka nộp lại proposal sau revision (→ PROPOSAL_REVIEW)' })
  @ApiErrors(NotSeriesOwnerException, InvalidProposalStateException)
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 201, type: SeriesResDto })
  resubmitProposal(@Param('id') id: string, @ActiveUser('userId') userId: string) {
    return this.seriesService.resubmitProposal(userId, id)
  }

  @Post(':id/proposal/approve')
  @ApiOperation({ summary: 'Editor duyệt proposal (→ PROPOSAL_APPROVED; nếu Name cũng APPROVED → READY_TO_PITCH)' })
  @ApiErrors(NotAssignedEditorException, SeriesNotFoundException, InvalidProposalStateException)
  @Roles(RoleName.EDITOR)
  @ZodResponse({ status: 201, type: SeriesResDto })
  approveProposal(@Param('id') id: string, @ActiveUser('userId') userId: string) {
    return this.seriesService.approveProposal(userId, id)
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Editor từ chối hẳn concept (Series → ABANDONED + statusReason)' })
  @ApiErrors(NotAssignedEditorException, SeriesNotFoundException, InvalidProposalStateException)
  @Roles(RoleName.EDITOR)
  @ZodResponse({ status: 201, type: SeriesResDto })
  reject(@Param('id') id: string, @Body() body: ReasonBodyDto, @ActiveUser('userId') userId: string) {
    return this.seriesService.rejectProposal(userId, id, body.reason)
  }

  @Post(':id/withdraw')
  @ApiOperation({ summary: 'Mangaka rút hồ sơ (Series → WITHDRAWN + statusReason)' })
  @ApiErrors(NotSeriesOwnerException, SeriesNotFoundException)
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 201, type: SeriesResDto })
  withdraw(@Param('id') id: string, @Body() body: ReasonBodyDto, @ActiveUser('userId') userId: string) {
    return this.seriesService.withdraw(userId, id, body.reason)
  }

  @Post(':id/reopen')
  @ApiOperation({
    summary: 'Mangaka mở lại hồ sơ đã ABANDONED/WITHDRAWN (Series → DRAFT, về hàng đợi khi nộp lại)'
  })
  @ApiErrors(NotSeriesOwnerException, SeriesNotFoundException, InvalidSeriesTransitionException)
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 201, type: SeriesResDto })
  reopen(@Param('id') id: string, @ActiveUser('userId') userId: string) {
    return this.seriesService.reopen(userId, id)
  }

  @Post(':id/reopen-review')
  @ApiOperation({
    summary: 'Editor mở lại vòng chỉnh sửa sau khi Board từ chối (REJECTED → IN_REVIEW, giữ editor)'
  })
  @ApiErrors(NotAssignedEditorException, SeriesNotFoundException, InvalidSeriesTransitionException)
  @Roles(RoleName.EDITOR)
  @ZodResponse({ status: 201, type: SeriesResDto })
  reopenReview(@Param('id') id: string, @Body() body: ReasonBodyDto, @ActiveUser('userId') userId: string) {
    return this.seriesService.reopenForReview(userId, id, body.reason)
  }

  @Post(':id/franchise-consent')
  @ApiOperation({
    summary: 'Mangaka gốc đồng ý/từ chối series phái sinh (A-SER-06). REJECTED chỉ block submit.'
  })
  @ApiErrors(SeriesNotFoundException, NotOriginalMangakaException, NotFranchiseConsentTargetException)
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 201, type: SeriesResDto })
  franchiseConsent(
    @Param('id') id: string,
    @Body() body: FranchiseConsentBodyDto,
    @ActiveUser('userId') userId: string
  ) {
    return this.seriesService.franchiseConsent(id, userId, body.approve)
  }

  @Post(':id/pitch')
  @ApiOperation({ summary: 'Editor pitch series lên Board (Series → PITCHED, gọi B5)' })
  @ApiErrors(NotAssignedEditorException, SeriesNotFoundException, SeriesNotReadyToPitchException)
  @Roles(RoleName.EDITOR)
  @ZodResponse({ status: 201, type: SeriesResDto })
  pitch(@Param('id') id: string, @ActiveUser('userId') userId: string) {
    return this.seriesService.pitch(userId, id)
  }

  @Post(':id/claim')
  @ApiOperation({ summary: 'Editor nhận series từ hàng đợi (atomic chống race; set editorId)' })
  @ApiErrors(SeriesNotFoundException, SeriesAlreadyClaimedException)
  @Roles(RoleName.EDITOR)
  @ZodResponse({ status: 201, type: SeriesResDto })
  claim(@Param('id') id: string, @ActiveUser('userId') userId: string) {
    return this.seriesService.claim(userId, id)
  }

  @Post(':id/release')
  @ApiOperation({ summary: 'Editor nhả series về hàng đợi (chỉ khi chưa bắt đầu review)' })
  @ApiErrors(NotAssignedEditorException, SeriesNotFoundException, ReviewAlreadyStartedException)
  @Roles(RoleName.EDITOR)
  @ZodResponse({ status: 201, type: SeriesResDto })
  release(@Param('id') id: string, @ActiveUser('userId') userId: string) {
    return this.seriesService.release(userId, id)
  }

  // Spec 2 / Flow 5: Editor-driven series lifecycle.
  @Post(':id/hiatus')
  @ApiOperation({ summary: 'Editor cho series tạm ngưng (SERIALIZED→HIATUS). Dừng đồng hồ TIME_BOUND.' })
  @ApiErrors(NotAssignedEditorException, SeriesNotFoundException, InvalidSeriesTransitionException)
  @Roles(RoleName.EDITOR)
  @ZodResponse({ status: 201, type: SeriesResDto })
  hiatus(@Param('id') id: string, @Body() body: HiatusBodyDto, @ActiveUser('userId') userId: string) {
    return this.seriesService.hiatus(userId, id, body.reason, body.expectedReturnDate)
  }

  @Post(':id/resume')
  @ApiOperation({
    summary: 'Editor cho series hoạt động lại (HIATUS→SERIALIZED). Dời deadline TIME_BOUND theo thời gian hiatus.'
  })
  @ApiErrors(NotAssignedEditorException, SeriesNotFoundException, InvalidSeriesTransitionException)
  @Roles(RoleName.EDITOR)
  @ZodResponse({ status: 201, type: SeriesResDto })
  resume(@Param('id') id: string, @ActiveUser('userId') userId: string) {
    return this.seriesService.resume(userId, id)
  }

  @Post(':id/finalize-ending')
  @ApiOperation({ summary: 'Editor chốt kết thúc: CANCELLING→CANCELLED / COMPLETING→COMPLETED.' })
  @ApiErrors(NotAssignedEditorException, SeriesNotFoundException, SeriesNotInEndingStateException)
  @Roles(RoleName.EDITOR)
  @ZodResponse({ status: 201, type: SeriesResDto })
  finalizeEnding(@Param('id') id: string, @ActiveUser('userId') userId: string) {
    return this.seriesService.finalizeEnding(userId, id)
  }

  // PB-06: Mangaka/Editor raises a soft natural-completion proposal. Status stays SERIALIZED/HIATUS;
  // only `completionProposal` is set. Counterparty (the other side) gets a notification.
  @Post(':id/propose-completion')
  @ApiOperation({ summary: 'Đề xuất kết thúc series tự nhiên (Mangaka/Editor) — PB-06' })
  @ApiErrors(SeriesAccessDeniedException, SeriesNotProposableForCompletionException, SeriesNotFoundException)
  @Roles(RoleName.MANGAKA, RoleName.EDITOR)
  @ZodResponse({ status: 200, type: SeriesResDto })
  proposeCompletion(
    @Param('id') id: string,
    @ActiveUser('userId') userId: string,
    @ActiveUser('roleName') roleName: string,
    @Body() dto: ProposeCompletionBodyDto
  ) {
    return this.seriesService.proposeCompletion(userId, roleName, id, dto)
  }

  // PB-06 / Req 1.11c: Editor closes a CANCELLING series without an ending (mangaka could not deliver).
  @Post(':id/force-cancel')
  @ApiOperation({ summary: 'Editor đóng series CANCELLING không ending (Req 1.11c) — PB-06' })
  @ApiErrors(NotAssignedEditorException, SeriesNotInCancellingStateException, SeriesNotFoundException)
  @Roles(RoleName.EDITOR)
  @ZodResponse({ status: 200, type: SeriesResDto })
  forceCancel(@Param('id') id: string, @ActiveUser('userId') userId: string) {
    return this.seriesService.forceCancel(userId, id)
  }
}
