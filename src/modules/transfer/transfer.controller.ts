import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { ApiErrors } from 'src/core/http/decorators/api-errors.decorator'
import { MessageResDto } from 'src/core/http/dto/response.dto'
import { ActiveUser } from 'src/core/security/decorators/active-user.decorator'
import { Roles } from 'src/core/security/decorators/roles.decorator'
import { RoleName } from 'src/core/security/constants/role.constant'
import {
  CreateTransferRequestBodyDto,
  BoardDecisionTransferBodyDto,
  CreateTransferContractBodyDto,
  SignTransferContractBodyDto,
  CoOwnerRejectChapterBodyDto,
  TransferRequestResDto,
  TransferRequestListResDto,
  TransferContractResDto,
  TransferSignatureListResDto
} from './dto/transfer.dto'
import {
  NoActiveContractFoundException,
  TransferRequestNotFoundException,
  InvalidStatusForScreeningException,
  OnlyAppliesToFullBuyoutException,
  OriginalContractIdNotFoundException,
  OnlyAppliesToRevenueShareException,
  RequestNotInNegotiatingStageException,
  TransferContractNotFoundException,
  UserOrEmailNotFoundException,
  UserHasAlreadySignedContractException,
  TransferContractNotFoundAfterUpdateException,
  NotTheCoOwnerForChapterException,
  ChapterApprovalIsNotPendingException
} from './errors/transfer.error'
import { TransferService } from './services/transfer.service'

@ApiTags('transfer')
@ApiBearerAuth()
@Controller('transfers')
export class TransferController {
  constructor(private readonly transferService: TransferService) {}

  // ---- Transfer Request (B-TRF-01/02) ----
  @Post('requests')
  @ApiOperation({ summary: 'Mangaka B tạo yêu cầu chuyển nhượng tác phẩm → PENDING_SCREENING' })
  @ApiResponse({ status: 422, description: 'Validation fail' })
  @ApiErrors(NoActiveContractFoundException)
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 201, type: TransferRequestResDto })
  createTransferRequest(
    @Body() body: CreateTransferRequestBodyDto,
    @ActiveUser('userId') userId: string
  ): Promise<InstanceType<typeof TransferRequestResDto>> {
    return this.transferService.createTransferRequest(userId, body)
  }

  @Get('requests/mine')
  @ApiOperation({ summary: 'Danh sách yêu cầu chuyển nhượng của Mangaka hiện tại' })
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 200, type: TransferRequestListResDto })
  getTransferRequestsByMangaka(
    @ActiveUser('userId') userId: string
  ): Promise<InstanceType<typeof TransferRequestListResDto>> {
    return this.transferService.getTransferRequestsByMangaka(userId)
  }

  @Get('requests/pending-board')
  @ApiOperation({ summary: 'Danh sách yêu cầu chuyển nhượng chờ Board xử lý' })
  @Roles(RoleName.BOARD_MEMBER)
  @ZodResponse({ status: 200, type: TransferRequestListResDto })
  getPendingBoardRequests(): Promise<InstanceType<typeof TransferRequestListResDto>> {
    return this.transferService.getPendingBoardRequests()
  }

  @Get('requests/:id')
  @ApiOperation({ summary: 'Chi tiết yêu cầu chuyển nhượng' })
  @ApiErrors(TransferRequestNotFoundException)
  @Roles(RoleName.MANGAKA, RoleName.EDITOR, RoleName.BOARD_MEMBER)
  @ZodResponse({ status: 200, type: TransferRequestResDto })
  getTransferRequestById(@Param('id') id: string): Promise<InstanceType<typeof TransferRequestResDto>> {
    return this.transferService.getTransferRequestById(id)
  }

  @Post('requests/:id/board-approve')
  @ApiOperation({ summary: 'Board duyệt sàng lọc yêu cầu chuyển nhượng' })
  @ApiResponse({ status: 422, description: 'Validation fail' })
  @ApiErrors(TransferRequestNotFoundException, InvalidStatusForScreeningException)
  @Roles(RoleName.BOARD_MEMBER)
  @ZodResponse({ status: 201, type: TransferRequestResDto })
  boardApproveScreening(
    @Param('id') id: string,
    @Body() body: BoardDecisionTransferBodyDto
  ): Promise<InstanceType<typeof TransferRequestResDto>> {
    return this.transferService.boardApproveScreening(id, body)
  }

  @Post('requests/:id/board-reject')
  @ApiOperation({ summary: 'Board từ chối sàng lọc yêu cầu chuyển nhượng' })
  @ApiResponse({ status: 422, description: 'Validation fail' })
  @ApiErrors(TransferRequestNotFoundException, InvalidStatusForScreeningException)
  @Roles(RoleName.BOARD_MEMBER)
  @ZodResponse({ status: 201, type: TransferRequestResDto })
  boardRejectScreening(
    @Param('id') id: string,
    @Body() body: BoardDecisionTransferBodyDto
  ): Promise<InstanceType<typeof TransferRequestResDto>> {
    return this.transferService.boardRejectScreening(id, body)
  }

  @Post('requests/:id/assign-full-buyout')
  @ApiOperation({ summary: 'Board chọn Full Buyout → bàn giao series cho Mangaka B' })
  @ApiResponse({ status: 422, description: 'Validation fail' })
  @ApiErrors(TransferRequestNotFoundException, OnlyAppliesToFullBuyoutException, OriginalContractIdNotFoundException)
  @Roles(RoleName.BOARD_MEMBER)
  @ZodResponse({ status: 201, type: MessageResDto })
  boardAssignFullBuyout(@Param('id') id: string, @Body() body: BoardDecisionTransferBodyDto): Promise<MessageResDto> {
    return this.transferService.boardAssignFullBuyout(id, body)
  }

  // ---- Negotiation & Three-Party Contracts (B-TRF-03) ----
  @Post('requests/:id/start-negotiation')
  @ApiOperation({ summary: 'Editor bắt đầu thương lượng Revenue Share với Mangaka A' })
  @ApiErrors(TransferRequestNotFoundException, OnlyAppliesToRevenueShareException)
  @Roles(RoleName.EDITOR)
  @ZodResponse({ status: 201, type: TransferRequestResDto })
  startNegotiation(@Param('id') id: string): Promise<InstanceType<typeof TransferRequestResDto>> {
    return this.transferService.startNegotiation(id)
  }

  @Post('requests/:id/mangaka-accept')
  @ApiOperation({ summary: 'Mangaka A đồng ý chuyển nhượng tác phẩm' })
  @ApiErrors(TransferRequestNotFoundException, RequestNotInNegotiatingStageException)
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 201, type: TransferRequestResDto })
  mangakaAcceptTransfer(@Param('id') id: string): Promise<InstanceType<typeof TransferRequestResDto>> {
    return this.transferService.mangakaAcceptTransfer(id)
  }

  @Post('requests/:id/mangaka-reject')
  @ApiOperation({ summary: 'Mangaka A từ chối chuyển nhượng tác phẩm' })
  @ApiErrors(TransferRequestNotFoundException, RequestNotInNegotiatingStageException)
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 201, type: TransferRequestResDto })
  mangakaRejectTransfer(@Param('id') id: string): Promise<InstanceType<typeof TransferRequestResDto>> {
    return this.transferService.mangakaRejectTransfer(id)
  }

  @Post('contracts')
  @ApiOperation({ summary: 'Editor tạo hợp đồng chuyển nhượng 3 bên → DRAFT' })
  @ApiResponse({ status: 422, description: 'Validation fail' })
  @ApiErrors(TransferRequestNotFoundException)
  @Roles(RoleName.EDITOR)
  @ZodResponse({ status: 201, type: TransferContractResDto })
  createTransferContract(
    @Body() body: CreateTransferContractBodyDto
  ): Promise<InstanceType<typeof TransferContractResDto>> {
    return this.transferService.createTransferContract(body)
  }

  @Post('contracts/:id/sign')
  @ApiOperation({ summary: 'Mangaka/Board ký hợp đồng chuyển nhượng bằng OTP' })
  @ApiResponse({ status: 422, description: 'Validation fail' })
  @ApiErrors(
    TransferContractNotFoundException,
    UserOrEmailNotFoundException,
    UserHasAlreadySignedContractException,
    TransferContractNotFoundAfterUpdateException
  )
  @Roles(RoleName.MANGAKA, RoleName.BOARD_MEMBER)
  @ZodResponse({ status: 201, type: MessageResDto })
  signTransferContract(
    @Param('id') id: string,
    @Query('signerRole') signerRole: 'MANGAKA_A' | 'MANGAKA_B' | 'BOARD',
    @Body() body: SignTransferContractBodyDto,
    @ActiveUser('userId') userId: string
  ): Promise<MessageResDto> {
    return this.transferService.signTransferContract(id, userId, signerRole, body)
  }

  @Get('contracts/:id/signatures')
  @ApiOperation({ summary: 'Danh sách chữ ký của hợp đồng chuyển nhượng' })
  @ApiErrors(TransferContractNotFoundException)
  @Roles(RoleName.MANGAKA, RoleName.EDITOR, RoleName.BOARD_MEMBER)
  @ZodResponse({ status: 200, type: TransferSignatureListResDto })
  getSignatures(@Param('id') id: string): Promise<InstanceType<typeof TransferSignatureListResDto>> {
    return this.transferService.getSignatures(id)
  }

  // ---- Co-Owner Chapter Approval (B-TRF-05) ----
  @Post('chapters/:chapterId/co-owner-approve')
  @ApiOperation({ summary: 'Co-owner duyệt chapter mới → APPROVED' })
  @ApiErrors(NotTheCoOwnerForChapterException, ChapterApprovalIsNotPendingException)
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 201, type: MessageResDto })
  coOwnerApproveChapter(
    @Param('chapterId') chapterId: string,
    @ActiveUser('userId') userId: string
  ): Promise<MessageResDto> {
    return this.transferService.coOwnerApproveChapter(chapterId, userId)
  }

  @Post('chapters/:chapterId/co-owner-reject')
  @ApiOperation({ summary: 'Co-owner từ chối chapter mới → REJECTED' })
  @ApiResponse({ status: 422, description: 'Validation fail' })
  @ApiErrors(NotTheCoOwnerForChapterException, ChapterApprovalIsNotPendingException)
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 201, type: MessageResDto })
  coOwnerRejectChapter(
    @Param('chapterId') chapterId: string,
    @Body() body: CoOwnerRejectChapterBodyDto,
    @ActiveUser('userId') userId: string
  ): Promise<MessageResDto> {
    return this.transferService.coOwnerRejectChapter(chapterId, userId, body)
  }

  @Post('chapters/:chapterId/escalate')
  @ApiOperation({ summary: 'Editor/Board escalate duyệt chapter lên Hội đồng' })
  @Roles(RoleName.EDITOR, RoleName.BOARD_MEMBER)
  @ZodResponse({ status: 201, type: MessageResDto })
  escalateChapterApproval(@Param('chapterId') chapterId: string): Promise<MessageResDto> {
    return this.transferService.escalateChapterApproval(chapterId)
  }
}
