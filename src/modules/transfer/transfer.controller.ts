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
  AssignFullBuyoutBodyDto,
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
  InvalidTransferStateException,
  ValuationRequiredException
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
  createTransferRequest(@Body() body: CreateTransferRequestBodyDto, @ActiveUser('userId') userId: string) {
    return this.transferService.createTransferRequest(userId, body)
  }

  @Get('requests/mine')
  @ApiOperation({ summary: 'Danh sách yêu cầu chuyển nhượng của Mangaka hiện tại' })
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 200, type: TransferRequestListResDto })
  getTransferRequestsByMangaka(@ActiveUser('userId') userId: string) {
    return this.transferService.getTransferRequestsByMangaka(userId)
  }

  @Get('requests/pending-board')
  @ApiOperation({ summary: 'Danh sách yêu cầu chuyển nhượng chờ Board xử lý' })
  @Roles(RoleName.BOARD_MEMBER)
  @ZodResponse({ status: 200, type: TransferRequestListResDto })
  getPendingBoardRequests() {
    return this.transferService.getPendingBoardRequests()
  }

  @Get('requests/:id')
  @ApiOperation({ summary: 'Chi tiết yêu cầu chuyển nhượng' })
  @ApiErrors(TransferRequestNotFoundException)
  @Roles(RoleName.MANGAKA, RoleName.EDITOR, RoleName.BOARD_MEMBER)
  @ZodResponse({ status: 200, type: TransferRequestResDto })
  getTransferRequestById(@Param('id') id: string) {
    return this.transferService.getTransferRequestById(id)
  }

  @Post('requests/:id/board-approve')
  @ApiOperation({ summary: 'Board duyệt sàng lọc yêu cầu chuyển nhượng' })
  @ApiResponse({ status: 422, description: 'Validation fail' })
  @ApiErrors(TransferRequestNotFoundException, InvalidStatusForScreeningException)
  @Roles(RoleName.BOARD_MEMBER)
  @ZodResponse({ status: 201, type: TransferRequestResDto })
  boardApproveScreening(@Param('id') id: string, @Body() body: BoardDecisionTransferBodyDto) {
    return this.transferService.boardApproveScreening(id, body)
  }

  @Post('requests/:id/board-reject')
  @ApiOperation({ summary: 'Board từ chối sàng lọc yêu cầu chuyển nhượng' })
  @ApiResponse({ status: 422, description: 'Validation fail' })
  @ApiErrors(TransferRequestNotFoundException, InvalidStatusForScreeningException)
  @Roles(RoleName.BOARD_MEMBER)
  @ZodResponse({ status: 201, type: TransferRequestResDto })
  boardRejectScreening(@Param('id') id: string, @Body() body: BoardDecisionTransferBodyDto) {
    return this.transferService.boardRejectScreening(id, body)
  }

  @Post('requests/:id/assign-full-buyout')
  @ApiOperation({ summary: 'Board chọn Full Buyout → bàn giao series cho Mangaka B' })
  @ApiResponse({ status: 422, description: 'Validation fail' })
  @ApiErrors(
    TransferRequestNotFoundException,
    OnlyAppliesToFullBuyoutException,
    OriginalContractIdNotFoundException,
    ValuationRequiredException
  )
  @Roles(RoleName.BOARD_MEMBER)
  @ZodResponse({ status: 201, type: MessageResDto })
  boardAssignFullBuyout(@Param('id') id: string, @Body() body: AssignFullBuyoutBodyDto): Promise<MessageResDto> {
    return this.transferService.boardAssignFullBuyout(id, body)
  }

  // ---- Negotiation & Three-Party Contracts (B-TRF-03) ----
  @Post('requests/:id/start-negotiation')
  @ApiOperation({ summary: 'Editor bắt đầu thương lượng Revenue Share với Mangaka A' })
  @ApiErrors(TransferRequestNotFoundException, OnlyAppliesToRevenueShareException)
  @Roles(RoleName.EDITOR)
  @ZodResponse({ status: 201, type: TransferRequestResDto })
  startNegotiation(@Param('id') id: string) {
    return this.transferService.startNegotiation(id)
  }

  @Post('requests/:id/mangaka-accept')
  @ApiOperation({ summary: 'Mangaka A đồng ý chuyển nhượng tác phẩm' })
  @ApiErrors(TransferRequestNotFoundException, RequestNotInNegotiatingStageException)
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 201, type: TransferRequestResDto })
  mangakaAcceptTransfer(@Param('id') id: string) {
    return this.transferService.mangakaAcceptTransfer(id)
  }

  @Post('requests/:id/mangaka-reject')
  @ApiOperation({ summary: 'Mangaka A từ chối chuyển nhượng tác phẩm' })
  @ApiErrors(TransferRequestNotFoundException, RequestNotInNegotiatingStageException)
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 201, type: TransferRequestResDto })
  mangakaRejectTransfer(@Param('id') id: string) {
    return this.transferService.mangakaRejectTransfer(id)
  }

  @Post('contracts')
  @ApiOperation({ summary: 'Editor tạo hợp đồng chuyển nhượng 3 bên → DRAFT (chỉ khi request UNDER_REVIEW)' })
  @ApiResponse({ status: 422, description: 'Validation fail' })
  @ApiErrors(TransferRequestNotFoundException, InvalidTransferStateException)
  @Roles(RoleName.EDITOR)
  @ZodResponse({ status: 201, type: TransferContractResDto })
  createTransferContract(@Body() body: CreateTransferContractBodyDto) {
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
  getSignatures(@Param('id') id: string) {
    return this.transferService.getSignatures(id)
  }

  // Co-owner chapter approval (A-CHP-06 / B-TRF-05) đã CHUYỂN sang chapter module (BE-A) —
  // POST /chapters/:id/co-owner-approve | /co-owner-reject (single-writer Manuscript ở chapter). Spec 6.
}
